package ru.lemuriapark.cashier;

import java.util.List;
import java.util.concurrent.Executor;
import org.json.JSONObject;
import ru.evotor.framework.component.PaymentPerformer;
import ru.evotor.framework.core.action.event.receipt.changes.position.PositionAdd;
import ru.evotor.framework.receipt.FiscalReceipt;

/** One serialized worker owns the journal, device commands and callback handling. */
final class CheckoutEngine {
    interface Status { void accept(String message); }
    private static final long UNKNOWN_AFTER_MS = 90_000;
    interface Remote {
        JSONObject claim(String claimId) throws Exception;
        void report(JSONObject result) throws Exception;
    }
    interface Device {
        String currentReceiptId();
        List<PositionAdd> preparePositions(Sale sale);
        PaymentPerformer performer(Sale.Method method);
        void printCash(Sale sale, List<PositionAdd> positions, EvotorGateway.DraftCallback callback) throws Exception;
        void open(Sale sale, List<PositionAdd> positions, EvotorGateway.DraftCallback callback) throws Exception;
        String findReceipt(Sale sale) throws Exception;
        String findOpenDraft(Sale sale) throws Exception;
        void dispatch(PaymentPerformer performer, Runnable changed);
        FiscalReceipt fiscalProof(Sale sale, String receiptId) throws Exception;
    }
    private final CheckoutJournal journal;
    private final Executor callbacks;
    private final Status status;
    CheckoutEngine(CheckoutJournal journal, Executor callbacks, Status status) {
        this.journal = journal;
        this.callbacks = callbacks;
        this.status = status;
    }
    private void tell(String message) { status.accept(message); }
    void tick(Remote crm, Device device, boolean accepting) throws Exception {
        JSONObject job = journal.current();
        if (job == null && !accepting && !journal.hasPendingClaim()) {
            tell("Приём заказов приостановлен");
            return;
        }
        if (job == null) {
            if (!journal.hasPendingClaim() && device.currentReceiptId() != null) {
                tell("Завершите открытый чек на Эвоторе перед приёмом заказа из CRM.");
                return;
            }
            JSONObject response = crm.claim(journal.pendingClaim());
            JSONObject payload = response.optJSONObject("sale");
            if (payload == null) {
                journal.emptyClaim();
                tell(response.isNull("unresolvedRequestId") ? "Ожидание заказа из CRM"
                        : "CRM ждёт сверки предыдущего расчёта. Проверьте Эвотор и терминал оплаты.");
                return;
            }
            new Sale(payload);
            job = journal.claim(payload);
        }
        Sale sale = new Sale(job.getJSONObject("sale"));
        switch (CheckoutJournal.phase(job)) {
            case CLAIMED:
                open(device, sale, job);
                break;
            case OPENING:
                String found = device.findReceipt(sale);
                if (found == null) tell("Эвотор открывает чек. При задержке проверьте экран кассы.");
                else journal.move(job.put("receiptId", found), CheckoutJournal.Phase.DRAFT);
                break;
            case DRAFT:
                if (!saveProof(device, sale, job)) beginPayment(device, sale, job);
                break;
            case DISPATCHED:
                if (!saveProof(device, sale, job) && System.currentTimeMillis() - job.getLong("updatedAt") >= UNKNOWN_AFTER_MS) {
                    if (!job.optBoolean("unknownSent")) {
                        crm.report(sale.result("UNKNOWN"));
                        journal.write(job.put("unknownSent", true));
                    }
                    tell("Проверьте итог оплаты на Эвоторе и в Сбере. Повторный запуск заблокирован.");
                }
                break;
            case REPORTING:
                JSONObject result = job.getJSONObject("result");
                crm.report(result);
                journal.acknowledge();
                tell("FISCALIZED".equals(result.getString("outcome"))
                        ? "Фискальный чек принят CRM" : "Заказ отменён до оплаты");
                break;
        }
    }

    private void open(Device device, Sale sale, JSONObject job) throws Exception {
        List<PositionAdd> positions;
        try {
            positions = device.preparePositions(sale);
            device.performer(sale.method);
        } catch (IllegalArgumentException | IllegalStateException invalid) {
            tell(invalid.getMessage());
            journal.move(job.put("result", sale.result("DECLINED")), CheckoutJournal.Phase.REPORTING);
            return;
        }
        if (device.currentReceiptId() != null) {
            tell("Завершите открытый чек на Эвоторе.");
            return;
        }
        try {
            if (device.currentReceiptId() != null) return;
            if (sale.method == Sale.Method.CASH) {
                journal.move(job, CheckoutJournal.Phase.DISPATCHED);
                tell("Печатаем чек. Сдача: " + java.math.BigDecimal.valueOf(sale.changeAmount, 2) + " ₽");
                device.printCash(sale, positions, id -> callbacks.execute(() -> rememberCashReceipt(sale, id)));
            } else {
                journal.move(job, CheckoutJournal.Phase.OPENING);
                tell("Открываем чек из CRM");
                device.open(sale, positions, id -> callbacks.execute(() -> rememberDraft(sale, id)));
            }
        } catch (Exception uncertain) {
            tell("Открытие чека требует сверки на Эвоторе.");
        }
    }

    private void rememberCashReceipt(Sale sale, String receiptId) {
        if (receiptId == null) return;
        try {
            JSONObject current = journal.current();
            if (current != null && CheckoutJournal.phase(current) == CheckoutJournal.Phase.DISPATCHED &&
                    sale.id.equals(current.getJSONObject("sale").getString("id"))) {
                journal.write(current.put("receiptId", receiptId));
            }
        } catch (Exception uncertain) { tell("Проверьте результат печати на Эвоторе."); }
    }

    private void rememberDraft(Sale sale, String receiptId) {
        if (receiptId == null) return;
        try {
            JSONObject current = journal.current();
            if (current != null && CheckoutJournal.phase(current) == CheckoutJournal.Phase.OPENING &&
                    sale.id.equals(current.getJSONObject("sale").getString("id"))) {
                journal.move(current.put("receiptId", receiptId), CheckoutJournal.Phase.DRAFT);
            }
        } catch (Exception uncertain) {
            tell("Проверьте открытый чек на Эвоторе.");
        }
    }

    private void beginPayment(Device device, Sale sale, JSONObject job) throws Exception {
        String receiptId = job.getString("receiptId");
        if (!receiptId.equals(device.findOpenDraft(sale))) {
            tell("Состав открытого чека изменился. Проверьте его на Эвоторе.");
            return;
        }
        PaymentPerformer performer = device.performer(sale.method);
        try {
            if (!receiptId.equals(device.currentReceiptId())) return;
            journal.move(job, CheckoutJournal.Phase.DISPATCHED);
            device.dispatch(performer, () -> {});
            tell(sale.method == Sale.Method.CASH
                    ? "Завершите приём наличных на Эвоторе."
                    : "Ожидаем оплату на банковском терминале.");
        } catch (Exception uncertain) {
            tell("Результат оплаты требует сверки. Повторный запуск заблокирован.");
        }
    }

    private boolean saveProof(Device device, Sale sale, JSONObject job) throws Exception {
        String receiptId = job.optString("receiptId", "");
        if (receiptId.isEmpty()) {
            receiptId = device.findReceipt(sale);
            if (receiptId == null) return false;
            journal.write(job.put("receiptId", receiptId));
        }
        FiscalReceipt proof = device.fiscalProof(sale, receiptId);
        if (proof == null) return false;
        JSONObject document = new JSONObject().put("serial", proof.getFiscalStorageNumber())
                .put("documentNumber", Long.toString(proof.getDocumentNumber()))
                .put("fiscalSign", proof.getFiscalIdentifier());
        JSONObject result = sale.result("FISCALIZED").put("amount", sale.amount)
                .put("paymentMethod", sale.method.name()).put("receipt", document);
        journal.move(job.put("result", result), CheckoutJournal.Phase.REPORTING);
        if (!proof.getWasPrinted()) tell("Чек зарегистрирован. Проверьте бумагу и допечатку на Эвоторе.");
        return true;
    }

}

package ru.lemuriapark.cashier;

import android.content.Context;
import android.content.ComponentName;
import android.os.Handler;
import android.os.Looper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;

import ru.evotor.framework.component.PaymentPerformer;
import ru.evotor.framework.component.PaymentPerformerApi;
import ru.evotor.framework.core.IntegrationManagerFuture;
import ru.evotor.framework.core.IntegrationManagerImpl;
import ru.evotor.framework.core.ActivityStarter;
import ru.evotor.framework.core.action.command.open_receipt_command.OpenReceiptCommandResult;
import ru.evotor.framework.core.action.command.open_receipt_command.OpenSellReceiptCommand;
import ru.evotor.framework.core.action.event.receipt.changes.position.PositionAdd;
import ru.evotor.framework.core.action.event.receipt.changes.receipt.SetExtra;
import ru.evotor.framework.inventory.InventoryApi;
import ru.evotor.framework.inventory.ProductItem;
import ru.evotor.framework.payment.PaymentType;
import ru.evotor.framework.receipt.FiscalReceipt;
import ru.evotor.framework.receipt.Payment;
import ru.evotor.framework.receipt.PrintGroup;
import ru.evotor.framework.core.action.command.print_receipt_command.PrintSellReceiptCommand;
import ru.evotor.framework.core.action.command.print_receipt_command.PrintReceiptCommandResult;
import ru.evotor.framework.receipt.Position;
import ru.evotor.framework.receipt.Receipt;
import ru.evotor.framework.receipt.ReceiptApi;
import ru.evotor.framework.receipt.SettlementType;
import ru.evotor.framework.receipt.formation.api.SellApi;
import ru.evotor.framework.receipt.formation.api.move_receipt_to_payment_stage.MoveCurrentReceiptDraftToPaymentStageCallback;
import ru.evotor.framework.receipt.formation.api.move_receipt_to_payment_stage.MoveCurrentReceiptDraftToPaymentStageException;
import ru.evotor.query.Cursor;

final class EvotorGateway implements CheckoutEngine.Device {
    private static final String REQUEST_TAG = "lemuriaCrmRequestId";
    private final Context context;
    private final Map<String, String> products;
    private final String cardPerformer;

    interface DraftCallback {
        void completed(String receiptId);
    }

    EvotorGateway(Context context, Map<String, String> products, String cardPerformer) {
        this.context = context;
        this.products = products;
        this.cardPerformer = cardPerformer;
    }

    public List<PositionAdd> preparePositions(Sale sale) {
        List<PositionAdd> positions = new ArrayList<>();
        for (int index = 0; index < sale.lines.size(); index++) {
            Sale.Line line = sale.lines.get(index);
            String productId = products.get(line.code);
            if (productId == null) throw new IllegalArgumentException("Нет карточки Эвотора для " + line.code);
            ProductItem item = InventoryApi.getProductByUuid(context, productId);
            if (!(item instanceof ProductItem.Product)) {
                throw new IllegalArgumentException("Карточка Эвотора не найдена для " + line.code);
            }
            Position position = Position.Builder.newInstance(
                    (ProductItem.Product) item, BigDecimal.valueOf(line.quantity))
                    .setUuid(lineId(sale, index))
                    .setPrice(line.unitPrice)
                    .build();
            positions.add(new PositionAdd(position));
        }
        return positions;
    }

    static String performerKey(PaymentPerformer p) {
        return p.getPackageName() + "/" + p.getComponentName() + "/" + p.getPaymentSystem().getPaymentSystemId();
    }

    static List<PaymentPerformer> bankPerformers(Context context) {
        List<PaymentPerformer> result = new ArrayList<>();
        for (PaymentPerformer p : PaymentPerformerApi.INSTANCE.getAllPaymentPerformers(context.getPackageManager())) {
            if (p.getPaymentSystem() != null && p.getPaymentSystem().getPaymentType() == PaymentType.ELECTRON &&
                    !"ru.evotor.paymentSystem.cashless.base".equals(p.getPaymentSystem().getPaymentSystemId())) result.add(p);
        }
        return result;
    }

    public PaymentPerformer performer(Sale.Method method) {
        PaymentPerformer selected = null;
        for (PaymentPerformer p : PaymentPerformerApi.INSTANCE.getAllPaymentPerformers(context.getPackageManager())) {
            if (p.getPaymentSystem() == null) continue;
            boolean matches = method == Sale.Method.CASH
                    ? "ru.evotor.paymentSystem.cash.base".equals(p.getPaymentSystem().getPaymentSystemId())
                    : cardPerformer.equals(performerKey(p)) &&
                        !"ru.evotor.paymentSystem.cashless.base".equals(p.getPaymentSystem().getPaymentSystemId());
            if (!matches) continue;
            if (selected != null) throw new IllegalStateException("Найдено несколько обработчиков оплаты");
            selected = p;
        }
        PaymentType type = method == Sale.Method.CASH ? PaymentType.CASH : PaymentType.ELECTRON;
        if (selected == null || selected.getPaymentSystem().getPaymentType() != type) {
            throw new IllegalStateException(method == Sale.Method.CASH ? "Наличные недоступны на Эвоторе"
                    : "Выберите банковское приложение в настройках подключения");
        }
        return selected;
    }

    public void printCash(Sale sale, List<PositionAdd> additions, DraftCallback callback) throws Exception {
        if (sale.method != Sale.Method.CASH) throw new IllegalArgumentException("Только наличные");
        List<Position> positions = new ArrayList<>();
        for (PositionAdd addition : additions) positions.add(addition.getPosition());
        Payment payment = new Payment(UUID.randomUUID().toString(), BigDecimal.valueOf(sale.cashReceived, 2),
                null, performer(sale.method), null, null, null);
        Receipt.PrintReceipt document = new Receipt.PrintReceipt(
                new PrintGroup(UUID.randomUUID().toString(), PrintGroup.Type.CASH_RECEIPT, null, null, null, null, true),
                positions, Collections.singletonMap(payment, payment.getValue()),
                Collections.singletonMap(payment, BigDecimal.valueOf(sale.changeAmount, 2)), Collections.emptyMap());
        new PrintSellReceiptCommand(Collections.singletonList(document),
                new SetExtra(new JSONObject().put(REQUEST_TAG, sale.id)), null, null, BigDecimal.ZERO,
                null, null, null, false).process(context, future -> {
            String receiptId = null;
            try {
                IntegrationManagerFuture.Result result = future.getResult();
                if (result.getType() == IntegrationManagerFuture.Result.Type.OK) {
                    PrintReceiptCommandResult receipt = PrintReceiptCommandResult.create(result.getData());
                    if (receipt != null) receiptId = receipt.getReceiptUuid();
                }
            } catch (Exception ignored) { /* Never repeat a print with an uncertain result. */ }
            callback.completed(receiptId);
        });
    }

    public String findReceipt(Sale sale) throws Exception {
        String found = null;
        try (Cursor<Receipt.Header> headers = ReceiptApi.getReceiptHeaders(context, Receipt.Type.SELL)) {
            if (headers == null) return null;
            while (headers.moveToNext()) {
                Receipt.Header header = headers.getValue();
                if (header == null || header.getExtra() == null) continue;
                if (!sale.id.equals(new JSONObject(header.getExtra()).optString(REQUEST_TAG))) continue;
                if (found != null) throw new IllegalStateException("Несколько чеков для заказа: требуется сверка");
                found = header.getUuid();
            }
        }
        return found;
    }

    public String currentReceiptId() {
        Receipt.Header current = ReceiptApi.getReceiptHeader(context, Receipt.Type.SELL);
        return current == null ? null : current.getUuid();
    }

    public void open(Sale sale, List<PositionAdd> positions, DraftCallback callback) throws Exception {
        SetExtra extra = new SetExtra(new JSONObject().put(REQUEST_TAG, sale.id));
        List<ComponentName> handlers = IntegrationManagerImpl.convertImplicitIntentToExplicitIntent(
                OpenSellReceiptCommand.NAME, context.getApplicationContext());
        if (handlers == null || handlers.size() != 1) {
            throw new IllegalStateException("Не найден однозначный обработчик открытия чека Эвотора");
        }
        // OpenSellReceiptCommand.process requires an Activity. Use the same SDK
        // transport with ActivityStarter(Context), as PrintReceiptCommand does.
        new IntegrationManagerImpl(context.getApplicationContext()).call(OpenSellReceiptCommand.NAME,
                handlers.get(0), new OpenSellReceiptCommand(positions, extra, null), new ActivityStarter(context, true), future -> {
            String receiptId = null;
            try {
                IntegrationManagerFuture.Result result = future.getResult();
                if (result.getType() == IntegrationManagerFuture.Result.Type.OK) {
                    OpenReceiptCommandResult receipt = OpenReceiptCommandResult.create(result.getData());
                    if (receipt != null) receiptId = receipt.getReceiptUuid();
                }
            } catch (Exception ignored) {
                // The persisted order stays in OPENING until its draft can be identified.
            }
            callback.completed(receiptId);
        }, new Handler(Looper.getMainLooper()));
    }

    public String findOpenDraft(Sale sale) throws Exception {
        Receipt receipt = ReceiptApi.getReceipt(context, Receipt.Type.SELL);
        if (receipt == null || !matches(sale, receipt) || !receipt.getPayments().isEmpty()) return null;
        return receipt.getHeader().getUuid();
    }

    public void dispatch(PaymentPerformer performer, Runnable changed) {
        SellApi.moveCurrentReceiptDraftToPaymentStage(context, performer,
                new MoveCurrentReceiptDraftToPaymentStageCallback() {
                    @Override public void onSuccess() { changed.run(); }
                    @Override public void onError(MoveCurrentReceiptDraftToPaymentStageException error) {
                        changed.run();
                    }
                });
    }

    public FiscalReceipt fiscalProof(Sale sale, String receiptId) throws Exception {
        Receipt receipt = ReceiptApi.getReceipt(context, receiptId);
        if (receipt == null || !matches(sale, receipt) || !matchesPayment(sale, receipt)) return null;
        try (Cursor<FiscalReceipt> records = ReceiptApi.getFiscalReceipts(context, receiptId)) {
            if (records == null || !records.moveToNext()) return null;
            FiscalReceipt fiscal = records.getValue();
            if (fiscal == null || fiscal.getSettlementType() != SettlementType.INCOME || records.moveToNext()) return null;
            String serial = fiscal.getFiscalStorageNumber(), sign = fiscal.getFiscalIdentifier();
            if (serial == null || !serial.matches("[0-9]{16}") || sign == null || !sign.matches("[0-9]{1,10}") ||
                    fiscal.getDocumentNumber() < 1 || fiscal.getDocumentNumber() > 9_999_999_999L) return null;
            return fiscal;
        }
    }

    private boolean matches(Sale sale, Receipt receipt) throws Exception {
        Receipt.Header header = receipt.getHeader();
        List<Position> positions = receipt.getPositions();
        if (header.getType() != Receipt.Type.SELL || header.getExtra() == null ||
                !sale.id.equals(new JSONObject(header.getExtra()).optString(REQUEST_TAG)) ||
                receipt.getDiscount().signum() != 0 || positions.size() != sale.lines.size()) return false;
        for (int i = 0; i < sale.lines.size(); i++) {
            Sale.Line line = sale.lines.get(i);
            String id = lineId(sale, i);
            Position match = null;
            for (Position position : positions) {
                if (id.equals(position.getUuid())) match = position;
            }
            String productId = products.get(line.code);
            if (match == null || productId == null || !productId.equals(match.getProductUuid()) ||
                    match.getPrice().compareTo(line.unitPrice) != 0 || match.getDiscountPositionSum().signum() != 0 ||
                    match.getQuantity().compareTo(BigDecimal.valueOf(line.quantity)) != 0 ||
                    (match.getSubPositions() != null && !match.getSubPositions().isEmpty())) return false;
        }
        return true;
    }

    private boolean matchesPayment(Sale sale, Receipt receipt) {
        List<Receipt.PrintReceipt> groups = receipt.getPrintDocuments();
        if (groups.size() != 1) return false;
        Receipt.PrintReceipt group = groups.get(0);
        if (group.getPayments().size() != 1) return false;
        Map.Entry<Payment, BigDecimal> entry = group.getPayments().entrySet().iterator().next();
        Payment payment = entry.getKey();
        if (!performerKey(performer(sale.method)).equals(performerKey(payment.getPaymentPerformer()))) return false;
        BigDecimal paid = entry.getValue();
        BigDecimal change = group.getChanges().get(payment);
        if (change == null) change = BigDecimal.ZERO;
        BigDecimal expected = BigDecimal.valueOf(sale.amount, 2);
        if (sale.method == Sale.Method.CARD_TERMINAL) {
            return change.signum() == 0 && paid.compareTo(expected) == 0;
        }
        return change.compareTo(BigDecimal.valueOf(sale.changeAmount, 2)) == 0 &&
                payment.getValue().compareTo(BigDecimal.valueOf(sale.cashReceived, 2)) == 0 &&
                payment.getValue().subtract(change).compareTo(expected) == 0 &&
                (paid.compareTo(expected) == 0 || paid.subtract(change).compareTo(expected) == 0);
    }

    private static String lineId(Sale sale, int index) {
        return UUID.nameUUIDFromBytes((sale.id + ":" + index).getBytes(StandardCharsets.UTF_8)).toString();
    }

}

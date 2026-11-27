package ru.lemuriapark.cashier;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

import ru.evotor.framework.component.PaymentPerformer;
import ru.evotor.framework.core.action.event.receipt.changes.position.PositionAdd;
import ru.evotor.framework.inventory.ProductItem;
import ru.evotor.framework.inventory.ProductQuery;
import ru.evotor.framework.receipt.FiscalReceipt;
import ru.evotor.query.Cursor;

public final class MainActivity extends Activity {
    private static final String DEFAULT_URL = "https://crm.xn--80ajjjbhwgdz8k.xn--p1ai" + CrmClient.PATH;
    private static final long CHECK_INTERVAL_MS = 2500;
    private static final long UNKNOWN_AFTER_MS = 90_000;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Runnable poll = this::tick;
    private SharedPreferences settings;
    private CheckoutJournal journal;
    private TextView status;
    private Button toggle;
    private Button setup;
    private volatile boolean foreground;
    private volatile boolean accepting;
    private volatile boolean destroyed;
    private boolean busy;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        settings = getSharedPreferences("settings", MODE_PRIVATE);
        journal = new CheckoutJournal(getSharedPreferences("checkout", MODE_PRIVATE));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = (int)(20 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding, padding, padding);
        TextView name = new TextView(this);
        name.setTextSize(24);
        name.setText("Лемурия Парк · касса");
        content.addView(name);
        status = new TextView(this);
        status.setTextSize(17);
        status.setText("Касса готова к настройке");
        content.addView(status);
        toggle = new Button(this);
        toggle.setText("Принимать заказы");
        toggle.setOnClickListener(view -> {
            accepting = !accepting;
            toggle.setText(accepting ? "Приостановить приём" : "Принимать заказы");
            if (accepting) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            updateSetup();
            wake();
        });
        content.addView(toggle);
        setup = new Button(this);
        setup.setText("Подключение и позиции");
        setup.setOnClickListener(view -> showSettings());
        content.addView(setup);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        setContentView(scroll);
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        wake();
    }

    @Override protected void onPause() {
        foreground = false;
        super.onPause();
    }

    @Override protected void onDestroy() {
        destroyed = true;
        ui.removeCallbacksAndMessages(null);
        worker.shutdown();
        super.onDestroy();
    }

    private void wake() {
        if (destroyed) return;
        ui.removeCallbacks(poll);
        ui.post(poll);
    }

    private void tell(String message) {
        ui.post(() -> {
            if (!destroyed) status.setText(message);
        });
    }

    private boolean hasJournal() {
        try {
            return journal.current() != null || journal.hasPendingClaim();
        } catch (Exception unreadable) {
            return true;
        }
    }

    private void updateSetup() {
        setup.setEnabled(!accepting && !busy && !hasJournal());
    }

    private void tick() {
        if (busy || destroyed) return;
        busy = true;
        updateSetup();
        worker.execute(() -> {
            try {
                check();
            } catch (Exception error) {
                String message = error.getLocalizedMessage();
                tell(message == null ? "Не удалось проверить состояние кассы" : message);
            } finally {
                ui.post(() -> {
                    busy = false;
                    if (destroyed) return;
                    updateSetup();
                    ui.removeCallbacks(poll);
                    ui.postDelayed(poll, CHECK_INTERVAL_MS);
                });
            }
        });
    }

    private void check() throws Exception {
        JSONObject job = journal.current();
        if (job == null && (!accepting || !foreground)) {
            if (foreground) tell("Приём заказов приостановлен");
            return;
        }
        CrmClient crm = new CrmClient(settings.getString("url", DEFAULT_URL), settings.getString("token", ""));
        EvotorGateway device = new EvotorGateway(this, readProducts(settings.getString("products", "")), settings.getString("cardPerformer", ""));
        if (job == null) {
            if (device.currentReceiptId() != null) {
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
                if (foreground) open(device, sale, job);
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

    private void open(EvotorGateway device, Sale sale, JSONObject job) throws Exception {
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
        ui.post(() -> {
            if (!foreground || destroyed) return;
            try {
                if (device.currentReceiptId() != null) return;
                if (sale.method == Sale.Method.CASH) {
                    journal.move(job, CheckoutJournal.Phase.DISPATCHED);
                    tell("Печатаем чек. Сдача: " + java.math.BigDecimal.valueOf(sale.changeAmount, 2) + " ₽");
                    device.printCash(sale, positions, id -> ui.post(() -> rememberCashReceipt(sale, id)));
                } else {
                    journal.move(job, CheckoutJournal.Phase.OPENING);
                    tell("Открываем чек из CRM");
                    device.open(sale, positions, id -> ui.post(() -> rememberDraft(sale, id)));
                }
            } catch (Exception uncertain) {
                tell("Открытие чека требует сверки на Эвоторе.");
            }
        });
    }

    private void rememberCashReceipt(Sale sale, String receiptId) {
        if (receiptId == null || destroyed) return;
        try {
            JSONObject current = journal.current();
            if (current != null && CheckoutJournal.phase(current) == CheckoutJournal.Phase.DISPATCHED &&
                    sale.id.equals(current.getJSONObject("sale").getString("id"))) {
                journal.write(current.put("receiptId", receiptId));
            }
            wake();
        } catch (Exception uncertain) { tell("Проверьте результат печати на Эвоторе."); }
    }

    private void rememberDraft(Sale sale, String receiptId) {
        if (receiptId == null || destroyed) return;
        try {
            JSONObject current = journal.current();
            if (current != null && CheckoutJournal.phase(current) == CheckoutJournal.Phase.OPENING &&
                    sale.id.equals(current.getJSONObject("sale").getString("id"))) {
                journal.move(current.put("receiptId", receiptId), CheckoutJournal.Phase.DRAFT);
            }
            wake();
        } catch (Exception uncertain) {
            tell("Проверьте открытый чек на Эвоторе.");
        }
    }

    private void beginPayment(EvotorGateway device, Sale sale, JSONObject job) throws Exception {
        String receiptId = job.getString("receiptId");
        if (!receiptId.equals(device.findOpenDraft(sale))) {
            tell("Состав открытого чека изменился. Проверьте его на Эвоторе.");
            return;
        }
        PaymentPerformer performer = device.performer(sale.method);
        ui.post(() -> {
            if (destroyed) return;
            try {
                if (!receiptId.equals(device.currentReceiptId())) return;
                journal.move(job, CheckoutJournal.Phase.DISPATCHED);
                device.dispatch(performer, () -> ui.post(this::wake));
                tell(sale.method == Sale.Method.CASH
                        ? "Завершите приём наличных на Эвоторе."
                        : "Ожидаем оплату на банковском терминале.");
            } catch (Exception uncertain) {
                tell("Результат оплаты требует сверки. Повторный запуск заблокирован.");
            }
        });
    }

    private boolean saveProof(EvotorGateway device, Sale sale, JSONObject job) throws Exception {
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

    static Map<String, String> readProducts(String source) {
        Map<String, String> mappings = new HashMap<>();
        for (String line : source.split("\\n")) {
            if (line.trim().isEmpty()) continue;
            String[] pair = line.trim().split("=", -1);
            if (pair.length != 2 || pair[0].trim().isEmpty()) {
                throw new IllegalArgumentException("Укажите соответствия в формате КОД=UUID");
            }
            String code = pair[0].trim();
            String product = UUID.fromString(pair[1].trim()).toString();
            if (mappings.put(code, product) != null) throw new IllegalArgumentException("Код продублирован · " + code);
        }
        if (mappings.isEmpty()) throw new IllegalArgumentException("Добавьте позиции кассы в настройках");
        return mappings;
    }

    private void showSettings() {
        if (accepting || hasJournal()) return;
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        EditText url = field(form, "HTTPS-адрес API", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        url.setText(settings.getString("url", DEFAULT_URL));
        EditText token = field(form, "Токен подключения", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        EditText products = field(form, "КОД ПОЗИЦИИ В CRM=UUID КАРТОЧКИ", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        products.setText(settings.getString("products", ""));
        Button catalog = new Button(this);
        catalog.setText("Выбрать карточку из Эвотора");
        catalog.setOnClickListener(button -> chooseProduct(products));
        form.addView(catalog);
        String[] selectedBank = {settings.getString("cardPerformer", "")};
        Button bank = new Button(this);
        bank.setText("Выбрать банковское приложение");
        bank.setOnClickListener(button -> {
            List<PaymentPerformer> choices = EvotorGateway.bankPerformers(this);
            if (choices.isEmpty()) {
                new AlertDialog.Builder(this).setMessage("На кассе не найдено подключённое банковское приложение.")
                        .setPositiveButton("Понятно", null).show();
                return;
            }
            String[] labels = new String[choices.size()];
            for (int i = 0; i < choices.size(); i++) labels[i] = choices.get(i).getAppName() + " · " + choices.get(i).getPaymentSystem().getUserDescription();
            new AlertDialog.Builder(this).setTitle("Банк для оплаты картой").setItems(labels, (d, index) -> {
                selectedBank[0] = EvotorGateway.performerKey(choices.get(index));
                bank.setText(labels[index]);
            }).show();
        });
        form.addView(bank);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(form);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Подключение к CRM").setView(scroll)
                .setNegativeButton("Назад", null).setPositiveButton("Сохранить", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            try {
                String endpoint = url.getText().toString().trim();
                String secret = token.getText().toString().trim();
                if (secret.isEmpty() && endpoint.equals(settings.getString("url", DEFAULT_URL))) {
                    secret = settings.getString("token", "");
                }
                String mappings = products.getText().toString();
                new CrmClient(endpoint, secret);
                readProducts(mappings);
                if (!settings.edit().putString("url", endpoint).putString("token", secret)
                        .putString("products", mappings).putString("cardPerformer", selectedBank[0]).commit()) throw new IllegalStateException("Настройки не сохранены");
                dialog.dismiss();
            } catch (Exception invalid) {
                products.setError(invalid.getLocalizedMessage());
            }
        }));
        dialog.show();
    }

    private EditText field(LinearLayout parent, String hint, int inputType) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setInputType(inputType);
        parent.addView(field);
        return field;
    }

    private void chooseProduct(EditText mappings) {
        EditText search = new EditText(this);
        search.setHint("Часть названия карточки");
        new AlertDialog.Builder(this).setTitle("Поиск в каталоге Эвотора").setView(search)
                .setNegativeButton("Назад", null).setPositiveButton("Найти", (d, which) -> {
                    String name = search.getText().toString().trim();
                    if (name.isEmpty()) return;
                    worker.execute(() -> {
                        List<ProductItem.Product> products = new ArrayList<>();
                        try (Cursor<ProductItem> found = new ProductQuery().name.like("%" + name + "%", null)
                                .limit(100).execute(this)) {
                            if (found != null) {
                                while (found.moveToNext()) {
                                    ProductItem product = found.getValue();
                                    if (product instanceof ProductItem.Product) products.add((ProductItem.Product) product);
                                }
                            }
                            ui.post(() -> { if (!destroyed) selectProduct(mappings, products); });
                        } catch (Exception failure) {
                            ui.post(() -> { if (!destroyed) mappings.setError("Не удалось прочитать каталог Эвотора"); });
                        }
                    });
                }).show();
    }

    private void selectProduct(EditText mappings, List<ProductItem.Product> products) {
        if (products.isEmpty()) {
            mappings.setError("Карточки не найдены");
            return;
        }
        String[] choices = new String[products.size()];
        for (int i = 0; i < products.size(); i++) {
            ProductItem.Product p = products.get(i);
            choices[i] = p.getName() + " · " + p.getPrice() + " ₽";
        }
        new AlertDialog.Builder(this).setTitle("Карточки Эвотора").setItems(choices, (dialog, index) -> {
            ProductItem.Product product = products.get(index);
            EditText code = new EditText(this);
            code.setHint("Код позиции в CRM");
            new AlertDialog.Builder(this).setTitle(product.getName()).setView(code)
                    .setNegativeButton("Назад", null).setPositiveButton("Добавить", (input, which) -> {
                        String value = code.getText().toString().trim();
                        if (value.isEmpty()) return;
                        if (mappings.length() > 0) mappings.append("\n");
                        mappings.append(value + "=" + product.getUuid());
                    }).show();
        }).setNegativeButton("Назад", null).show();
    }
}

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

import ru.evotor.framework.component.PaymentPerformer;
import ru.evotor.framework.inventory.ProductItem;
import ru.evotor.framework.inventory.ProductQuery;
import ru.evotor.query.Cursor;

public final class MainActivity extends Activity {
    static final String DEFAULT_URL = (BuildConfig.STAGING_ONLY
            ? CrmClient.STAGING_ORIGIN : "https://crm.xn--80ajjjbhwgdz8k.xn--p1ai") + CrmClient.PATH;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Runnable refresh = this::refreshStatus;
    private CheckoutService service;
    private boolean bound;
    private final android.content.ServiceConnection connection = new android.content.ServiceConnection() {
        @Override public void onServiceConnected(android.content.ComponentName name, android.os.IBinder binder) {
            service = ((CheckoutService.LocalBinder) binder).service();
            refreshStatus();
        }
        @Override public void onServiceDisconnected(android.content.ComponentName name) { service = null; }
    };
    private SharedPreferences settings;
    private CheckoutJournal journal;
    private TextView status;
    private Button toggle;
    private Button setup;
    private volatile boolean accepting;
    private volatile boolean destroyed;

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
        name.setText(getApplicationInfo().loadLabel(getPackageManager()));
        content.addView(name);
        status = new TextView(this);
        status.setTextSize(17);
        status.setText("Касса готова к настройке");
        content.addView(status);
        toggle = new Button(this);
        toggle.setText("Принимать заказы");
        toggle.setOnClickListener(view -> {
            if (!settings.edit().putBoolean("accepting", !accepting).commit()) {
                status.setText("Не удалось сохранить режим приёма");
                return;
            }
            CheckoutService.start(this);
            refreshStatus();
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
        CheckoutService.start(this);
        if (!bound) bound = bindService(new android.content.Intent(this, CheckoutService.class), connection, BIND_AUTO_CREATE);
        refreshStatus();
    }

    @Override protected void onPause() {
        ui.removeCallbacks(refresh);
        if (bound) { unbindService(connection); bound = false; service = null; }
        super.onPause();
    }

    @Override protected void onDestroy() {
        destroyed = true;
        ui.removeCallbacksAndMessages(null);
        worker.shutdown();
        super.onDestroy();
    }

    private boolean hasJournal() {
        try { return journal.current() != null || journal.hasPendingClaim(); }
        catch (Exception unreadable) { return true; }
    }

    private void refreshStatus() {
        if (destroyed) return;
        accepting = settings.getBoolean("accepting", false);
        toggle.setText(accepting ? "Приостановить приём" : "Принимать заказы");
        setup.setEnabled(!accepting && service != null && !service.isBusy() && !hasJournal());
        if (service != null) status.setText(service.status());
        ui.removeCallbacks(refresh);
        ui.postDelayed(refresh, 500);
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
        if (settings.getBoolean("accepting", false) || service == null || service.isBusy() || hasJournal()) return;
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
                if (settings.getBoolean("accepting", false) || service == null || service.isBusy() || hasJournal())
                    throw new IllegalStateException("Дождитесь завершения расчёта");
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

package ru.lemuriapark.cashier;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Owns checkout independently of the configuration activity's lifecycle. */
public final class CheckoutService extends Service {
    private static final String CHANNEL = "checkout";
    private static final int NOTIFICATION = 1;
    private final Handler main = new Handler(Looper.getMainLooper());
    // Shared across service recreation within the same process: a slow old
    // request cannot race a new service instance and dispatch another payment.
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Runnable poll = this::tick;
    private final LocalBinder binder = new LocalBinder();
    private SharedPreferences settings;
    private CheckoutJournal journal;
    private CheckoutEngine engine;
    private volatile boolean busy;
    private volatile boolean destroyed;
    private volatile String message = "Проверяем состояние кассы";
    private String notified;

    final class LocalBinder extends Binder {
        CheckoutService service() { return CheckoutService.this; }
    }

    static void start(Context context) {
        Intent intent = new Intent(context, CheckoutService.class);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
        else context.startService(intent);
    }

    @Override public void onCreate() {
        super.onCreate();
        settings = getSharedPreferences("settings", MODE_PRIVATE);
        journal = new CheckoutJournal(getSharedPreferences("checkout", MODE_PRIVATE));
        // SDK callbacks may run on a different thread. All journal access and
        // device commands are queued onto the same worker, never an Activity.
        engine = new CheckoutEngine(journal, action -> {
            if (!destroyed) worker.execute(() -> { if (!destroyed) action.run(); });
        }, this::tell);
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager.class).createNotificationChannel(
                    new NotificationChannel(CHANNEL, "Приём заказов CRM", NotificationManager.IMPORTANCE_LOW));
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION, notification());
        main.removeCallbacks(poll);
        main.post(poll);
        return START_STICKY;
    }

    @Override public IBinder onBind(Intent intent) { return binder; }
    boolean isBusy() { return busy; }
    String status() { return message; }

    private Notification notification() {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent action = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return builder.setSmallIcon(android.R.drawable.ic_popup_sync)
                .setContentTitle("Лемурия Парк · касса").setContentText(message)
                .setStyle(new Notification.BigTextStyle().bigText(message))
                .setContentIntent(action).setOngoing(true).setOnlyAlertOnce(true).build();
    }

    private void tell(String value) {
        message = value;
        main.post(() -> {
            if (destroyed || value.equals(notified)) return;
            notified = value;
            getSystemService(NotificationManager.class).notify(NOTIFICATION, notification());
        });
    }

    private boolean hasWork() {
        try { return journal.current() != null || journal.hasPendingClaim(); }
        catch (Exception unreadable) { return true; }
    }

    private void tick() {
        if (destroyed || busy) return;
        if (!settings.getBoolean("accepting", false) && !hasWork()) {
            message = "Приём заказов приостановлен";
            stopForeground(true);
            stopSelf();
            return;
        }
        busy = true;
        worker.execute(() -> {
            if (destroyed) return;
            PowerManager.WakeLock wake = null;
            try {
                wake = getSystemService(PowerManager.class).newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK, "lemuria:checkout");
                // Bounded to the network timeouts; never keep the CPU awake indefinitely.
                wake.acquire(30_000);
                CrmClient crm = new CrmClient(settings.getString("url", MainActivity.DEFAULT_URL), settings.getString("token", ""));
                EvotorGateway device = new EvotorGateway(this,
                        MainActivity.readProducts(settings.getString("products", "")), settings.getString("cardPerformer", ""));
                engine.tick(crm, device, settings.getBoolean("accepting", false));
            } catch (Exception failure) {
                String detail = failure.getLocalizedMessage();
                tell(detail == null ? "Не удалось проверить состояние кассы" : detail);
            } finally {
                if (wake != null && wake.isHeld()) wake.release();
                main.post(() -> {
                    busy = false;
                    if (!destroyed) {
                        main.removeCallbacks(poll);
                        main.postDelayed(poll, 2500);
                    }
                });
            }
        });
    }

    @Override public void onDestroy() {
        destroyed = true;
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}

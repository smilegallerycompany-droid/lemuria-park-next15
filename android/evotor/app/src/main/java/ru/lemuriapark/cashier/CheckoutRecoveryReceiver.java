package ru.lemuriapark.cashier;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Resume only a previously enabled reception or an unfinished calculation. */
public final class CheckoutRecoveryReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) &&
                !Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) return;
        CheckoutJournal journal = new CheckoutJournal(context.getSharedPreferences("checkout", Context.MODE_PRIVATE));
        boolean recover;
        try { recover = journal.current() != null || journal.hasPendingClaim(); }
        catch (Exception unreadable) { recover = true; }
        if (recover || context.getSharedPreferences("settings", Context.MODE_PRIVATE).getBoolean("accepting", false)) {
            CheckoutService.start(context);
        }
    }
}

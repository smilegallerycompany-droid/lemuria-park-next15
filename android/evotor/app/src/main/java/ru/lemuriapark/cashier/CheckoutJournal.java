package ru.lemuriapark.cashier;

import android.content.SharedPreferences;
import org.json.JSONException;
import org.json.JSONObject;

final class CheckoutJournal {
    private static final String KEY = "pendingCheckout";

    enum Phase {
        CLAIMED, OPENING, DRAFT, DISPATCHED, REPORTING;

        boolean permits(Phase next) {
            switch (this) {
                case CLAIMED: return next == OPENING || next == DISPATCHED || next == REPORTING;
                case OPENING: return next == DRAFT;
                case DRAFT: return next == DISPATCHED || next == REPORTING;
                case DISPATCHED: return next == REPORTING;
                default: return false;
            }
        }
    }

    private final SharedPreferences disk;

    CheckoutJournal(SharedPreferences disk) {
        this.disk = disk;
    }

    synchronized JSONObject current() throws JSONException {
        String raw = disk.getString(KEY, null);
        return raw == null ? null : new JSONObject(raw);
    }

    // Persist before HTTP. Retrying this nonce can recover a lost response but
    // can never claim a second sale. It is removed atomically with the sale write.
    synchronized boolean hasPendingClaim() {
        return disk.getString("pendingClaimId", null) != null;
    }

    synchronized String pendingClaim() {
        String id = disk.getString("pendingClaimId", null);
        if (id == null) {
            id = java.util.UUID.randomUUID().toString();
            requireCommit(disk.edit().putString("pendingClaimId", id).commit());
        }
        return id;
    }

    synchronized void emptyClaim() {
        requireCommit(disk.edit().remove("pendingClaimId").commit());
    }

    synchronized JSONObject claim(JSONObject sale) throws JSONException {
        if (current() != null) throw new IllegalStateException("Предыдущий заказ ещё обрабатывается");
        JSONObject job = new JSONObject().put("sale", sale).put("phase", Phase.CLAIMED.name());
        requireCommit(disk.edit().putString(KEY, job.toString()).remove("pendingClaimId").commit());
        return job;
    }

    synchronized void move(JSONObject job, Phase to) throws JSONException {
        Phase from = phase(job);
        JSONObject stored = current();
        if (stored == null || phase(stored) != from || !from.permits(to) ||
                !stored.getJSONObject("sale").getString("id").equals(job.getJSONObject("sale").getString("id"))) {
            throw new IllegalStateException("Состояние заказа уже изменилось");
        }
        write(job.put("phase", to.name()).put("updatedAt", System.currentTimeMillis()));
    }

    synchronized void write(JSONObject job) {
        requireCommit(disk.edit().putString(KEY, job.toString()).commit());
    }

    synchronized void acknowledge() {
        requireCommit(disk.edit().remove(KEY).commit());
    }

    static Phase phase(JSONObject job) throws JSONException {
        return Phase.valueOf(job.getString("phase"));
    }

    private static void requireCommit(boolean committed) {
        if (!committed) throw new IllegalStateException("Эвотор не может сохранить состояние заказа");
    }
}

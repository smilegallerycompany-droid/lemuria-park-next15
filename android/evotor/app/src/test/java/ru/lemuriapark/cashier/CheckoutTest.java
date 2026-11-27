package ru.lemuriapark.cashier;

import android.content.SharedPreferences;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.*;

public final class CheckoutTest {
    @Test public void restoresDispatchedSaleAndRetriesOnlyItsReceipt() throws Exception {
        SharedPreferences preferences = inMemoryPreferences();
        CheckoutJournal journal = new CheckoutJournal(preferences);
        journal.claim(payload(80000));
        journal.move(journal.current(), CheckoutJournal.Phase.OPENING);
        journal.move(journal.current().put("receiptId", "receipt-1"), CheckoutJournal.Phase.DRAFT);
        JSONObject stale = journal.current();
        journal.move(journal.current(), CheckoutJournal.Phase.DISPATCHED);
        CheckoutJournal restarted = new CheckoutJournal(preferences);
        JSONObject pending = restarted.current();
        assertEquals("receipt-1", pending.getString("receiptId"));
        assertEquals(CheckoutJournal.Phase.DISPATCHED, CheckoutJournal.phase(pending));
        assertThrows(IllegalStateException.class, () -> restarted.move(stale, CheckoutJournal.Phase.DISPATCHED));
        restarted.move(pending.put("result", new JSONObject().put("outcome", "FISCALIZED")), CheckoutJournal.Phase.REPORTING);
        assertEquals("FISCALIZED", new CheckoutJournal(preferences).current().getJSONObject("result").getString("outcome"));
        restarted.acknowledge();
        assertNull(journal.current());
    }

    @Test public void validatesExactOrderAmounts() throws Exception {
        Sale sale = new Sale(payload(80000));
        assertEquals(new BigDecimal("400.00"), sale.lines.get(0).unitPrice);
        assertThrows(IllegalArgumentException.class, () -> new Sale(payload(79999)));
        assertThrows(IllegalArgumentException.class, () -> new Sale.Line("ADULT", 2, 80001));
    }

    @Test public void cashRequiresExactReceivedAndChange() throws Exception {
        JSONObject data = payload(80000).put("paymentMethod", "CASH").put("cashReceived", 100000).put("changeAmount", 20000);
        Sale cash = new Sale(data);
        assertEquals(100000, cash.cashReceived);
        assertEquals(20000, cash.changeAmount);
        assertThrows(IllegalArgumentException.class, () -> new Sale(new JSONObject(data.toString()).put("changeAmount", 10000)));
        assertThrows(IllegalArgumentException.class, () -> new Sale(new JSONObject(data.toString()).put("cashReceived", 70000)));
        data.remove("cashReceived");
        assertThrows(org.json.JSONException.class, () -> new Sale(data));
    }

    @Test public void cashPrintIsPersistedBeforeDispatchAndNeverRepeated() throws Exception {
        SharedPreferences preferences = inMemoryPreferences();
        CheckoutJournal journal = new CheckoutJournal(preferences);
        JSONObject job = journal.claim(payload(80000).put("paymentMethod", "CASH").put("cashReceived", 100000).put("changeAmount", 20000));
        journal.move(job, CheckoutJournal.Phase.DISPATCHED);
        CheckoutJournal restored = new CheckoutJournal(preferences);
        assertEquals(CheckoutJournal.Phase.DISPATCHED, CheckoutJournal.phase(restored.current()));
        assertThrows(IllegalStateException.class, () -> restored.move(restored.current(), CheckoutJournal.Phase.DISPATCHED));
    }

    @Test public void lostClaimResponseUsesSameNonceAcrossRestart() throws Exception {
        SharedPreferences disk = inMemoryPreferences();
        CheckoutJournal first = new CheckoutJournal(disk);
        String id = first.pendingClaim();
        assertTrue(first.hasPendingClaim());
        CheckoutJournal restarted = new CheckoutJournal(disk);
        assertEquals(id, restarted.pendingClaim());
        restarted.claim(payload(80000));
        assertFalse(restarted.hasPendingClaim());
        assertNotNull(new CheckoutJournal(disk).current());
        restarted.acknowledge();
        assertNotEquals(id, restarted.pendingClaim());
        restarted.emptyClaim();
        assertNotEquals(id, restarted.pendingClaim());
    }

    private JSONObject payload(int total) throws Exception {
        JSONObject line = new JSONObject().put("code", "ADULT").put("quantity", 2).put("amount", 80000);
        return new JSONObject().put("id", "request-1").put("paymentMethod", "CARD_TERMINAL")
                .put("totalAmount", total).put("items", new JSONArray().put(line));
    }

    private SharedPreferences inMemoryPreferences() {
        Map<String, String> disk = new HashMap<>();
        ClassLoader loader = getClass().getClassLoader();
        return (SharedPreferences) Proxy.newProxyInstance(loader, new Class<?>[]{SharedPreferences.class},
                (proxy, method, args) -> {
                    if ("getString".equals(method.getName())) return disk.getOrDefault((String) args[0], (String) args[1]);
                    if (!"edit".equals(method.getName())) throw new UnsupportedOperationException(method.getName());
                    Map<String, String> pending = new HashMap<>(disk);
                    return Proxy.newProxyInstance(loader, new Class<?>[]{SharedPreferences.Editor.class},
                            (editor, command, values) -> {
                                switch (command.getName()) {
                                    case "putString": pending.put((String) values[0], (String) values[1]); return editor;
                                    case "remove": pending.remove((String) values[0]); return editor;
                                    case "commit": disk.clear(); disk.putAll(pending); return true;
                                    default: throw new UnsupportedOperationException(command.getName());
                                }
                            });
                });
    }
}

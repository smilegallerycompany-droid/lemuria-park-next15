package ru.lemuriapark.cashier;

import android.content.SharedPreferences;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import ru.evotor.framework.component.PaymentPerformer;
import ru.evotor.framework.core.action.event.receipt.changes.position.PositionAdd;
import ru.evotor.framework.receipt.FiscalReceipt;
import ru.evotor.framework.receipt.SettlementType;
import static org.junit.Assert.*;

public final class CheckoutEngineTest {
    private final SharedPreferences disk = CheckoutTest.inMemoryPreferences();
    private CheckoutJournal journal = new CheckoutJournal(disk);
    private final List<Runnable> callbacks = new ArrayList<>();
    private final Remote crm = new Remote();
    private final Device device = new Device();
    private CheckoutEngine engine = engine();

    private CheckoutEngine engine() { return new CheckoutEngine(journal, callbacks::add, message -> {}); }
    private void restart() { journal = new CheckoutJournal(disk); engine = engine(); }
    private void tick(boolean accepting) throws Exception { engine.tick(crm, device, accepting); }
    private void drain() { while (!callbacks.isEmpty()) callbacks.remove(0).run(); }

    @Test public void cashCompletesAfterWindowIsGoneAndReceptionPaused() throws Exception {
        crm.sale = payload("CASH");
        tick(true);
        assertEquals(1, device.prints);
        assertEquals(CheckoutJournal.Phase.DISPATCHED, CheckoutJournal.phase(journal.current()));
        device.callback.completed("receipt-1"); drain();
        restart();
        device.proof = proof();
        tick(false); // no Activity, no new reception, still finish the claimed transaction
        tick(false);
        assertNull(journal.current());
        assertEquals("FISCALIZED", crm.results.get(0).getString("outcome"));
        assertEquals(80000, crm.results.get(0).getInt("amount"));
        assertEquals(1, device.prints);
        assertEquals(1, crm.claims);
        tick(false);
        assertEquals(1, crm.results.size());
    }

    @Test public void cardStartsBankWithoutAnActivityAndNeverDispatchesTwice() throws Exception {
        crm.sale = payload("CARD_TERMINAL");
        tick(true);
        device.current = "receipt-1";
        device.callback.completed("receipt-1"); drain();
        tick(true);
        assertEquals(1, device.dispatches);
        restart();
        tick(false); tick(false);
        assertEquals(1, device.opens);
        assertEquals(1, device.dispatches);
        assertEquals(0, crm.results.size());
    }

    @Test public void failedResultDeliveryRetriesSameEvidenceWithoutChargingAgain() throws Exception {
        crm.sale = payload("CASH");
        tick(true);
        device.found = "receipt-1";
        device.proof = proof();
        tick(true);
        crm.failReport = true;
        assertThrows(IOException.class, () -> tick(false));
        String before = journal.current().getJSONObject("result").toString();
        restart();
        crm.failReport = false;
        tick(false);
        assertEquals(before, crm.results.get(0).toString());
        assertNull(journal.current());
        assertEquals(1, device.prints);
    }

    @Test public void lostClaimResponseIsRecoveredEvenWhenPaused() throws Exception {
        crm.sale = payload("CASH");
        crm.failClaim = true;
        assertThrows(IOException.class, () -> tick(true));
        String id = crm.claimIds.get(0);
        restart();
        crm.failClaim = false;
        tick(false);
        assertEquals(id, crm.claimIds.get(1));
        assertEquals(1, device.prints);
    }

    @Test public void emptyPausedQueueDoesNotClaimAndExistingManualReceiptIsNotOverwritten() throws Exception {
        tick(false);
        assertEquals(0, crm.claims);
        device.current = "manual-receipt";
        tick(true);
        assertEquals(0, crm.claims);
        assertEquals(0, device.opens);
        assertEquals(0, device.prints);
    }

    @Test public void changedDraftNeverStartsBank() throws Exception {
        crm.sale = payload("CARD_TERMINAL");
        tick(true);
        device.callback.completed("receipt-1"); drain();
        device.current = "receipt-1";
        device.matchDraft = false;
        tick(true);
        assertEquals(0, device.dispatches);
        assertEquals(CheckoutJournal.Phase.DRAFT, CheckoutJournal.phase(journal.current()));
    }

    @Test public void missingProductDeclinesBeforePaymentAndReportsWhilePaused() throws Exception {
        crm.sale = payload("CASH");
        device.invalid = true;
        tick(true); tick(false);
        assertEquals("DECLINED", crm.results.get(0).getString("outcome"));
        assertEquals(0, device.prints);
        assertNull(journal.current());
    }

    @Test public void uncertainBankDispatchRemainsBlockedAcrossRestarts() throws Exception {
        crm.sale = payload("CARD_TERMINAL");
        tick(true);
        device.callback.completed("receipt-1"); drain();
        device.current = "receipt-1";
        device.failDispatch = true;
        tick(true);
        journal.write(journal.current().put("updatedAt", 0));
        restart(); tick(false); tick(false);
        assertEquals(1, device.dispatches);
        assertEquals(1, crm.results.size());
        assertEquals("UNKNOWN", crm.results.get(0).getString("outcome"));
        assertEquals(CheckoutJournal.Phase.DISPATCHED, CheckoutJournal.phase(journal.current()));
    }

    @Test public void lateCallbackCannotRevertFiscalEvidence() throws Exception {
        crm.sale = payload("CASH");
        tick(true);
        device.found = "receipt-1";
        device.proof = proof();
        tick(true);
        device.callback.completed("receipt-1"); drain();
        assertEquals(CheckoutJournal.Phase.REPORTING, CheckoutJournal.phase(journal.current()));
        tick(false);
        device.callback.completed("receipt-1"); drain();
        assertNull(journal.current());
        assertEquals(1, device.prints);
    }

    @Test public void lostOpeningCallbackRecoversExistingReceiptWithoutOpeningAnother() throws Exception {
        crm.sale = payload("CARD_TERMINAL");
        tick(true);
        restart();
        device.found = "receipt-1";
        device.current = "receipt-1";
        tick(false); tick(false);
        assertEquals(1, device.opens);
        assertEquals(1, device.dispatches);
    }

    @Test public void unreadableJournalNeverStartsANewSale() throws Exception {
        disk.edit().putString("pendingCheckout", "broken-json").commit();
        restart();
        assertThrows(org.json.JSONException.class, () -> tick(true));
        assertEquals(0, crm.claims);
        assertEquals(0, device.prints);
        assertEquals(0, device.opens);
    }

    private static JSONObject payload(String method) throws Exception {
        return new JSONObject().put("id", "order-1").put("paymentMethod", method)
                .put("totalAmount", 80000).put("cashReceived", 100000).put("changeAmount", 20000)
                .put("items", new JSONArray().put(new JSONObject().put("code", "ADULT").put("quantity", 2).put("amount", 80000)));
    }
    private static FiscalReceipt proof() {
        return new FiscalReceipt(42, new Date(), SettlementType.INCOME, "1234567890123456", 1,
                "1234567890123456", "1234567890", true);
    }

    private static final class Remote implements CheckoutEngine.Remote {
        JSONObject sale;
        int claims;
        boolean failClaim, failReport;
        final List<String> claimIds = new ArrayList<>();
        final List<JSONObject> results = new ArrayList<>();
        public JSONObject claim(String id) throws Exception {
            claims++; claimIds.add(id);
            if (failClaim) throw new IOException("response lost");
            return new JSONObject().put("sale", sale == null ? JSONObject.NULL : sale).put("unresolvedRequestId", JSONObject.NULL);
        }
        public void report(JSONObject result) throws Exception {
            if (failReport) throw new IOException("response lost");
            results.add(new JSONObject(result.toString()));
        }
    }

    private static final class Device implements CheckoutEngine.Device {
        int prints, opens, dispatches;
        boolean invalid, failDispatch, matchDraft = true;
        String current, found;
        FiscalReceipt proof;
        EvotorGateway.DraftCallback callback;
        public String currentReceiptId() { return current; }
        public List<PositionAdd> preparePositions(Sale sale) {
            if (invalid) throw new IllegalArgumentException("missing product");
            return Collections.emptyList();
        }
        public PaymentPerformer performer(Sale.Method method) { return null; }
        public void printCash(Sale sale, List<PositionAdd> positions, EvotorGateway.DraftCallback result) { prints++; callback = result; }
        public void open(Sale sale, List<PositionAdd> positions, EvotorGateway.DraftCallback result) { opens++; callback = result; }
        public String findReceipt(Sale sale) { return found; }
        public String findOpenDraft(Sale sale) { return matchDraft ? current : null; }
        public void dispatch(PaymentPerformer performer, Runnable changed) {
            dispatches++;
            if (failDispatch) throw new IllegalStateException("uncertain result");
        }
        public FiscalReceipt fiscalProof(Sale sale, String id) { return proof; }
    }
}

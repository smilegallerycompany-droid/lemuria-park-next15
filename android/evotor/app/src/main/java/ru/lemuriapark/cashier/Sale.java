package ru.lemuriapark.cashier;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class Sale {
    enum Method { CASH, CARD_TERMINAL }

    static final class Line {
        final String code;
        final int quantity;
        final BigDecimal unitPrice;

        Line(String code, int quantity, int amount) {
            if (code.isEmpty() || quantity < 1 || quantity > 999 || amount < 1 || amount % quantity != 0) {
                throw new IllegalArgumentException("Некорректная позиция заказа");
            }
            this.code = code;
            this.quantity = quantity;
            unitPrice = BigDecimal.valueOf(amount / quantity, 2);
        }
    }

    final String id;
    final Method method;
    final int amount;
    final int cashReceived;
    final int changeAmount;
    final List<Line> lines;

    Sale(JSONObject data) throws JSONException {
        id = data.getString("id");
        method = Method.valueOf(data.getString("paymentMethod"));
        amount = data.getInt("totalAmount");
        cashReceived = method == Method.CASH ? data.getInt("cashReceived") : 0;
        changeAmount = method == Method.CASH ? data.getInt("changeAmount") : 0;
        if (method == Method.CASH && (cashReceived < amount || changeAmount != cashReceived - amount)) {
            throw new IllegalArgumentException("Сумма наличных и сдача не совпадают с заказом");
        }
        JSONArray items = data.getJSONArray("items");
        if (id.isEmpty() || amount < 1 || items.length() == 0 || items.length() > 100) {
            throw new IllegalArgumentException("Некорректный заказ");
        }
        List<Line> copy = new ArrayList<>();
        long total = 0;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.getJSONObject(i);
            int subtotal = item.getInt("amount");
            copy.add(new Line(item.getString("code"), item.getInt("quantity"), subtotal));
            total += subtotal;
        }
        if (total != amount) throw new IllegalArgumentException("Состав заказа не совпадает с итогом");
        lines = Collections.unmodifiableList(copy);
    }

    JSONObject result(String outcome) throws JSONException {
        return new JSONObject().put("requestId", id).put("outcome", outcome);
    }
}

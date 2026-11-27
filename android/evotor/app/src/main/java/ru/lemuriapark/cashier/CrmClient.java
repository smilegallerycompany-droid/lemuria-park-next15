package ru.lemuriapark.cashier;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

final class CrmClient implements CheckoutEngine.Remote {
    static final String PATH = "/api/integrations/evotor/checkout";
    private final URL endpoint;
    private final String token;

    CrmClient(String url, String token) throws IOException {
        endpoint = new URL(url);
        if (!"https".equals(endpoint.getProtocol()) || endpoint.getHost().isEmpty() ||
                endpoint.getUserInfo() != null || !PATH.equals(endpoint.getPath()) ||
                endpoint.getQuery() != null || endpoint.getRef() != null) {
            throw new IllegalArgumentException("Укажите HTTPS-адрес API кассы");
        }
        if (token.length() < 32 || token.matches(".*\\s.*")) {
            throw new IllegalArgumentException("Укажите токен подключения Эвотора");
        }
        this.token = token;
    }

    public JSONObject claim(String claimId) throws Exception {
        return post(new JSONObject().put("action", "claim").put("claimId", claimId), 15000);
    }

    public void report(JSONObject result) throws Exception {
        JSONObject data = post(new JSONObject().put("action", "result").put("result", result), 5000);
        String outcome = result.getString("outcome");
        if (("FISCALIZED".equals(outcome) || "DECLINED".equals(outcome)) &&
                !outcome.equals(data.getString("state"))) {
            throw new IOException("CRM не подтвердила сохранение результата");
        }
    }

    private JSONObject post(JSONObject body, int readTimeoutMs) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) endpoint.openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(readTimeoutMs);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Content-Type", "application/json");
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(payload);
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                StringBuilder detail = new StringBuilder("HTTP ").append(status)
                        .append(" · POST ").append(endpoint.getHost()).append(PATH);
                for (String name : new String[]{"Server", "Allow", "Via", "Content-Type", "x-request-id"}) {
                    String value = connection.getHeaderField(name);
                    if (value == null || value.trim().isEmpty()) continue;
                    String safe = value.replace(token, "[скрыто]").replaceAll("[\\p{Cntrl}]", " ");
                    detail.append("\n").append(name).append(": ")
                            .append(safe, 0, Math.min(safe.length(), 96));
                }
                throw new IOException(detail.toString());
            }
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int count;
                while ((count = in.read(buffer)) != -1) {
                    if (out.size() + count > 65536) throw new IOException("Ответ CRM слишком большой");
                    out.write(buffer, 0, count);
                }
                JSONObject json = new JSONObject(out.toString("UTF-8"));
                if (!json.getBoolean("ok")) throw new IOException("CRM отклонила запрос");
                return json.getJSONObject("data");
            }
        } finally {
            connection.disconnect();
        }
    }
}

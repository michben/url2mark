package com.michben.url2mark;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Transmet à l'interface le texte/URL partagé vers url2mark depuis une autre application. */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    private static String pending;
    private static ShareReceiverPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    static void receive(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) return;
        if (instance != null && instance.hasListeners("shared")) {
            JSObject data = new JSObject();
            data.put("text", text);
            instance.notifyListeners("shared", data);
        } else {
            pending = text;
        }
    }

    @PluginMethod
    public void getShared(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", pending);
        pending = null;
        call.resolve(result);
    }
}

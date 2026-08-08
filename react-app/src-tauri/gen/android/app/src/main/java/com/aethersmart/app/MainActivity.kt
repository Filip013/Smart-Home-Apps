package com.aethersmart.app

import android.graphics.Color
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Transparent bars with light (white) icons — the dark app background shows
    // through, so the status + navigation bars match the dark theme (unlike
    // LingoHub, which leaves a light bottom bar).
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    // Keep app content below the status bar and above the navigation bar.
    // Android 15+ (targetSdk 35/36) forces edge-to-edge, so the WebView draws
    // under the system bars — pad the root with the system-bar insets.
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }
    // Dark background behind the transparent bars (matches --color-bg)
    window.decorView.setBackgroundColor(Color.parseColor("#0b0f19"))
  }
}

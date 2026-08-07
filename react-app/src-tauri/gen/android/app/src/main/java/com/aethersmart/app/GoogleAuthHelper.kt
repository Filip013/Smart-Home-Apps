package com.aethersmart.app

import android.app.Activity
import android.content.Intent
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object GoogleAuthHelper {
    private const val RC_SIGN_IN = 9001
    private var pendingToken: String? = null
    private var pendingError: String? = null
    private var latch: CountDownLatch? = null

    // Called from Rust via JNI - blocks until result
    @JvmStatic
    fun signIn(activity: Activity): String {
        pendingToken = null
        pendingError = null
        latch = CountDownLatch(1)

        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken("115950049911-lgnk07grs7avnq8tc37dcpr6i9c0clq2.apps.googleusercontent.com")
            .requestEmail()
            .build()
        val client = GoogleSignIn.getClient(activity, gso)
        // Clear previous account to force account chooser
        try { client.signOut() } catch (_: Exception) {}

        val signInIntent = client.signInIntent
        activity.startActivityForResult(signInIntent, RC_SIGN_IN)

        // Block up to 60s
        val completed = latch?.await(60, TimeUnit.SECONDS) ?: false
        if (!completed) {
            throw RuntimeException("Google Sign-In timed out")
        }
        pendingError?.let { throw RuntimeException(it) }
        return pendingToken ?: throw RuntimeException("No ID token returned")
    }

    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != RC_SIGN_IN) return
        try {
            val task = GoogleSignIn.getSignedInAccountFromIntent(data)
            val account = task.getResult(ApiException::class.java)
            val idToken = account.idToken
            if (idToken != null) {
                pendingToken = idToken
            } else {
                pendingError = "No ID token - check web client ID and SHA-1 in Firebase console"
            }
        } catch (e: ApiException) {
            pendingError = "Google sign in failed: ${e.statusCode} ${e.message}"
        } catch (e: Exception) {
            pendingError = e.message ?: "Unknown error"
        } finally {
            latch?.countDown()
        }
    }
}

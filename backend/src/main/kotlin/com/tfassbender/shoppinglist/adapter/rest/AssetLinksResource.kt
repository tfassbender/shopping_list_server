package com.tfassbender.shoppinglist.adapter.rest

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.eclipse.microprofile.openapi.annotations.Operation
import java.util.Optional

data class AssetLinkTarget(
    val namespace: String,
    @get:JsonProperty("package_name")
    val packageName: String,
    @get:JsonProperty("sha256_cert_fingerprints")
    val sha256CertFingerprints: List<String>,
)

data class AssetLinkStatement(val relation: List<String>, val target: AssetLinkTarget)

/** One Android app (package) and the fingerprints of the keys it may be signed with. */
data class AndroidApp(val packageName: String, val fingerprints: List<String>)

/**
 * Digital Asset Links for Android App Links: lets the Android app open the web app's links (invites,
 * email verification, password reset - see `doc/tech_stack.md`) instead of the browser. Android fetches
 * this file without authentication when the app is installed.
 *
 * Release and debug app are configured separately, each with its own fingerprints: if both packages shared
 * one list, an app signed with the (less protected) debug key could claim the links under the release
 * package name. The fingerprints are only known once the signing keys exist; an app without fingerprints
 * is left out, so without configuration the list is empty (valid, verifies no app).
 */
@Path("/.well-known/assetlinks.json")
class AssetLinksResource(
    @param:ConfigProperty(name = "shoppinglist.android.release.package-name")
    private val releasePackage: String,
    @param:ConfigProperty(name = "shoppinglist.android.release.sha256-cert-fingerprints")
    private val releaseFingerprints: Optional<List<String>>,
    @param:ConfigProperty(name = "shoppinglist.android.debug.package-name")
    private val debugPackage: String,
    @param:ConfigProperty(name = "shoppinglist.android.debug.sha256-cert-fingerprints")
    private val debugFingerprints: Optional<List<String>>,
) {

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    // Not part of the REST API: a well-known file for the Android system, so kept out of generated clients.
    @Operation(hidden = true)
    fun assetLinks(): List<AssetLinkStatement> = statementsFor(
        listOf(
            AndroidApp(releasePackage, releaseFingerprints.orElse(emptyList())),
            AndroidApp(debugPackage, debugFingerprints.orElse(emptyList())),
        ),
    )

    companion object {
        const val HANDLE_ALL_URLS = "delegate_permission/common.handle_all_urls"

        /** One statement per app that has a package name and at least one fingerprint (normalized to upper case). */
        fun statementsFor(apps: List<AndroidApp>): List<AssetLinkStatement> = apps.mapNotNull { app ->
            val packageName = app.packageName.trim()
            val certs = app.fingerprints.map { it.trim().uppercase() }.filter { it.isNotEmpty() }
            if (packageName.isEmpty() || certs.isEmpty()) {
                null
            } else {
                AssetLinkStatement(listOf(HANDLE_ALL_URLS), AssetLinkTarget("android_app", packageName, certs))
            }
        }
    }
}

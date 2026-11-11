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

/**
 * Digital Asset Links for Android App Links: lets the Android app open the web app's links (invites,
 * email verification, password reset - see `doc/tech_stack.md`) instead of the browser. Android fetches
 * this file without authentication when the app is installed.
 *
 * The fingerprints come from configuration because they are only known once the app's signing keys exist;
 * without them the list is empty, which is valid and simply verifies no app.
 */
@Path("/.well-known/assetlinks.json")
class AssetLinksResource(
    @param:ConfigProperty(name = "shoppinglist.android.package-names")
    private val packageNames: Optional<List<String>>,
    @param:ConfigProperty(name = "shoppinglist.android.sha256-cert-fingerprints")
    private val fingerprints: Optional<List<String>>,
) {

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    // Not part of the REST API: a well-known file for the Android system, so kept out of generated clients.
    @Operation(hidden = true)
    fun assetLinks(): List<AssetLinkStatement> {
        val certs = fingerprints.orElse(emptyList()).map { it.trim().uppercase() }.filter { it.isNotEmpty() }
        if (certs.isEmpty()) return emptyList()
        return packageNames.orElse(emptyList()).map { it.trim() }.filter { it.isNotEmpty() }.map { packageName ->
            AssetLinkStatement(listOf(HANDLE_ALL_URLS), AssetLinkTarget("android_app", packageName, certs))
        }
    }

    companion object {
        const val HANDLE_ALL_URLS = "delegate_permission/common.handle_all_urls"
    }
}

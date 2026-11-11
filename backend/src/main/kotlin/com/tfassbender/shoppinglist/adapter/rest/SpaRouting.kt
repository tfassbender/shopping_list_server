package com.tfassbender.shoppinglist.adapter.rest

import io.vertx.ext.web.Router
import io.vertx.ext.web.RoutingContext
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.event.Observes

/**
 * Client-side routing support for the React SPA: deep links like `/lists/123` don't exist as files, so
 * they are rerouted to `/` (which serves `index.html`) and React Router takes over in the browser.
 *
 * Not rerouted: the API (`/api/...`), Quarkus endpoints (`/q/...` – OpenAPI, Swagger UI, dev UI) and
 * anything that looks like a file (contains a dot in the last path segment, e.g. `/assets/app.js`).
 */
@ApplicationScoped
class SpaRouting {

    fun registerSpaFallback(@Observes router: Router) {
        router.get("/*").handler(::rerouteSpaPaths)
    }

    private fun rerouteSpaPaths(context: RoutingContext) {
        if (isSpaRoute(context.normalizedPath())) {
            context.reroute("/")
        } else {
            context.next()
        }
    }

    companion object {
        fun isSpaRoute(path: String): Boolean {
            if (path == "/" || path.startsWith("/api/") || path == "/api" || path.startsWith("/q/")) {
                return false
            }
            val lastSegment = path.substringAfterLast('/')
            return !lastSegment.contains('.')
        }
    }
}

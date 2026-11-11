package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import jakarta.ws.rs.WebApplicationException
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.ext.ExceptionMapper
import jakarta.ws.rs.ext.Provider
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import java.util.UUID

/**
 * The single place where exceptions become JSON error responses, so the inner layers stay free of HTTP:
 * - [DomainException] → status derived from its [ErrorKind], with its stable code;
 * - [IllegalArgumentException] (malformed request) → 400 `INVALID_REQUEST`;
 * - framework [WebApplicationException]s (unknown route, missing auth, ...) → their own status, JSON body;
 * - anything else → 500 `INTERNAL_ERROR`, logged under an error id. Internal details only reach the client
 *   in dev mode (`shoppinglist.errors.include-stack-trace`).
 */
@Provider
class RestExceptionMapper(
    @param:ConfigProperty(name = "shoppinglist.errors.include-stack-trace", defaultValue = "false")
    private val includeStackTrace: Boolean,
) : ExceptionMapper<Throwable> {

    private val log: Logger = Logger.getLogger(RestExceptionMapper::class.java)

    override fun toResponse(exception: Throwable): Response = when (exception) {
        is DomainException -> error(statusFor(exception.kind), exception.code, exception.message)
        is IllegalArgumentException -> error(Response.Status.BAD_REQUEST.statusCode, "INVALID_REQUEST", exception.message)
        is WebApplicationException -> frameworkError(exception)
        else -> internalError(exception)
    }

    private fun frameworkError(exception: WebApplicationException): Response {
        val status = exception.response.status
        val code = Response.Status.fromStatusCode(status)?.name ?: "HTTP_$status"
        return error(status, code, exception.message)
    }

    private fun internalError(exception: Throwable): Response {
        val errorId = UUID.randomUUID().toString()
        log.errorf(exception, "Unhandled error (id %s)", errorId)
        val message = "Internal error (id $errorId)"
        val body = ErrorResponse(
            code = "INTERNAL_ERROR",
            message = if (includeStackTrace) "$message: $exception" else message,
            errorId = errorId,
            stackTrace = if (includeStackTrace) exception.stackTraceToString() else null,
        )
        return json(Response.Status.INTERNAL_SERVER_ERROR.statusCode, body)
    }

    private fun error(status: Int, code: String, message: String?): Response =
        json(status, ErrorResponse(code, message))

    private fun json(status: Int, body: ErrorResponse): Response =
        Response.status(status).type(MediaType.APPLICATION_JSON).entity(body).build()

    private fun statusFor(kind: ErrorKind): Int = when (kind) {
        ErrorKind.VALIDATION -> 400
        ErrorKind.UNAUTHORIZED -> 401
        ErrorKind.FORBIDDEN -> 403
        ErrorKind.NOT_FOUND -> 404
        ErrorKind.CONFLICT -> 409
        ErrorKind.UNAVAILABLE -> 503
    }
}

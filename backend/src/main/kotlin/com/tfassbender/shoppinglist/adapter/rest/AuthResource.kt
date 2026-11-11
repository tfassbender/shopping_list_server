package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.auth.AccountService
import com.tfassbender.shoppinglist.application.auth.AuthService
import com.tfassbender.shoppinglist.application.auth.Passwords
import com.tfassbender.shoppinglist.application.auth.RegisterCommand
import com.tfassbender.shoppinglist.domain.user.Language
import jakarta.annotation.security.RolesAllowed
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.media.Content
import org.eclipse.microprofile.openapi.annotations.media.Schema
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse
import org.eclipse.microprofile.openapi.annotations.tags.Tag
import org.jboss.resteasy.reactive.ResponseStatus

/** Registration, login and the email-token flows. All public except `refresh`. */
@Path("/api/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Auth")
class AuthResource(
    private val authService: AuthService,
    private val accountService: AccountService,
    private val currentUser: CurrentUser,
) {

    @GET
    @Path("/config")
    @Operation(operationId = "getAuthConfig", summary = "Whether email features (verification, reset) are enabled")
    fun config() = AuthConfigResponse(emailEnabled = !authService.emailDisabled, minPasswordLength = Passwords.MIN_LENGTH)

    @POST
    @Path("/register")
    @Operation(
        operationId = "register",
        summary = "Create an account. Returns a session unless the email must be verified first",
    )
    @ResponseStatus(201)
    @APIResponse(responseCode = "201", description = "Created", content = [Content(schema = Schema(implementation = SessionResponse::class))])
    fun register(request: RegisterRequest): SessionResponse {
        val command = RegisterCommand(
            email = request.email,
            displayName = request.displayName,
            password = request.password,
            language = request.language?.let(Language::fromCode) ?: Language.EN,
        )
        val result = authService.register(command)
        return SessionResponse.from(result)
    }

    @POST
    @Path("/login")
    @Operation(operationId = "login", summary = "Log in with email and password")
    fun login(request: LoginRequest) = SessionResponse.from(authService.login(request.email, request.password))

    @POST
    @Path("/refresh")
    @RolesAllowed(SESSION_ROLE)
    @Operation(operationId = "refreshSession", summary = "Exchange a still valid session token for a fresh one")
    fun refresh() = SessionResponse.from(authService.refresh(accountService.me(currentUser.id())))

    @POST
    @Path("/verify-email")
    @Operation(operationId = "verifyEmail", summary = "Confirm the email address with the emailed token")
    fun verifyEmail(request: TokenRequest) = SessionResponse.from(authService.verifyEmail(request.token))

    @POST
    @Path("/resend-verification")
    @Operation(operationId = "resendVerification", summary = "Send the verification email again (always 204)")
    // Without this, the spec would claim 201 for a POST without return value; the server sends 204.
    @APIResponse(responseCode = "204", description = "No Content")
    fun resendVerification(request: EmailRequest) {
        authService.resendVerification(request.email)
    }

    @POST
    @Path("/forgot-password")
    @Operation(operationId = "forgotPassword", summary = "Email a password reset link (always 204)")
    // Without this, the spec would claim 201 for a POST without return value; the server sends 204.
    @APIResponse(responseCode = "204", description = "No Content")
    fun forgotPassword(request: EmailRequest) {
        authService.requestPasswordReset(request.email)
    }

    @POST
    @Path("/reset-password")
    @Operation(operationId = "resetPassword", summary = "Set a new password with the emailed token")
    fun resetPassword(request: ResetPasswordRequest) =
        SessionResponse.from(authService.resetPassword(request.token, request.password))
}

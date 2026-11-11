package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.auth.AccountService
import com.tfassbender.shoppinglist.application.space.AccountDeletionService
import jakarta.annotation.security.RolesAllowed
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.DELETE
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.PUT
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.tags.Tag

/** The logged-in user's own account. */
@Path("/api/users/me")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed(USER_ROLE)
@Tag(name = "Account")
class AccountResource(
    private val accountService: AccountService,
    private val accountDeletionService: AccountDeletionService,
    private val currentUser: CurrentUser,
) {

    @GET
    @Operation(operationId = "getMe", summary = "The current user incl. settings")
    fun me() = UserDto.from(accountService.me(currentUser.id()))

    @PUT
    @Path("/settings")
    @Operation(operationId = "updateSettings", summary = "Replace the personal settings")
    fun updateSettings(settings: SettingsDto) =
        UserDto.from(accountService.updateSettings(currentUser.id(), settings.toDomain()))

    @PUT
    @Path("/display-name")
    @Operation(operationId = "updateDisplayName", summary = "Change the display name shown to other members")
    fun updateDisplayName(request: DisplayNameRequest) =
        UserDto.from(accountService.rename(currentUser.id(), request.displayName))

    @POST
    @Path("/change-password")
    @RolesAllowed(SESSION_ROLE)
    @Operation(operationId = "changePassword", summary = "Change the password; logs out all other sessions")
    fun changePassword(request: ChangePasswordRequest) = SessionResponse.from(
        accountService.changePassword(currentUser.id(), request.currentPassword, request.newPassword),
    )

    @POST
    @Path("/logout-everywhere")
    @RolesAllowed(SESSION_ROLE)
    @Operation(operationId = "logoutEverywhere", summary = "Invalidate all sessions; returns a fresh one for this device")
    fun logoutEverywhere() = SessionResponse.from(accountService.logoutEverywhere(currentUser.id()))

    @DELETE
    @RolesAllowed(SESSION_ROLE)
    @Operation(
        operationId = "deleteAccount",
        summary = "Delete the account; owned spaces pass to the longest-standing member or are deleted",
    )
    fun deleteAccount() {
        accountDeletionService.deleteAccount(currentUser.id())
    }
}

package com.tfassbender.shoppinglist.adapter.rest

import com.fasterxml.jackson.annotation.JsonInclude
import com.tfassbender.shoppinglist.application.auth.AuthResult
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.ThemePreference
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserSettings
import java.time.Instant

data class RegisterRequest(
    val email: String = "",
    val displayName: String = "",
    val password: String = "",
    /** `en` or `de`; also decides the language of the default categories of new spaces. */
    val language: String? = null,
)

data class LoginRequest(val email: String = "", val password: String = "")
data class EmailRequest(val email: String = "")
data class TokenRequest(val token: String = "")
data class ResetPasswordRequest(val token: String = "", val password: String = "")
data class ChangePasswordRequest(val currentPassword: String = "", val newPassword: String = "")
data class DisplayNameRequest(val displayName: String = "")

data class SettingsDto(
    val language: String,
    val theme: ThemePreference,
    val checkedItemsToEnd: Boolean,
    val ignoreMergeWarnings: Boolean,
) {
    fun toDomain() = UserSettings(Language.fromCode(language), theme, checkedItemsToEnd, ignoreMergeWarnings)

    companion object {
        fun from(settings: UserSettings) = SettingsDto(
            settings.language.code,
            settings.theme,
            settings.checkedItemsToEnd,
            settings.ignoreMergeWarnings,
        )
    }
}

data class UserDto(
    val id: String,
    val email: String,
    val displayName: String,
    val emailVerified: Boolean,
    val settings: SettingsDto,
) {
    companion object {
        fun from(user: User) = UserDto(
            user.id.value,
            user.email.value,
            user.displayName,
            user.emailVerified,
            SettingsDto.from(user.settings),
        )
    }
}

/** A session: `token` is null after registration while the email still needs to be verified. */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class SessionResponse(
    val user: UserDto,
    val token: String?,
    val expiresAt: Instant?,
    val verificationRequired: Boolean,
) {
    companion object {
        fun from(result: AuthResult) = SessionResponse(
            user = UserDto.from(result.user),
            token = result.session?.value,
            expiresAt = result.session?.expiresAt,
            verificationRequired = result.session == null,
        )
    }
}

data class AuthConfigResponse(val emailEnabled: Boolean, val minPasswordLength: Int)

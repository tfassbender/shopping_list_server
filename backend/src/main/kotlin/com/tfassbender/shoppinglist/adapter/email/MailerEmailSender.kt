package com.tfassbender.shoppinglist.adapter.email

import com.tfassbender.shoppinglist.application.port.EmailSender
import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.Language
import io.quarkus.mailer.Mail
import io.quarkus.mailer.Mailer
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty

/**
 * Sends account emails via the Quarkus [Mailer] in the user's language. Links point to SPA pages that
 * post the token back to the API. In dev/test the mailer is mocked (and not called: email is disabled).
 */
@ApplicationScoped
class MailerEmailSender(
    private val mailer: Mailer,
    @param:ConfigProperty(name = "shoppinglist.public-base-url")
    private val publicBaseUrl: String,
) : EmailSender {

    override fun sendVerification(to: Email, displayName: String, language: Language, rawToken: String) {
        val link = "$publicBaseUrl/verify-email?token=$rawToken"
        val texts = EmailTexts.verification(language, displayName, link)
        mailer.send(Mail.withText(to.value, texts.first, texts.second))
    }

    override fun sendPasswordReset(to: Email, displayName: String, language: Language, rawToken: String) {
        val link = "$publicBaseUrl/reset-password?token=$rawToken"
        val texts = EmailTexts.passwordReset(language, displayName, link)
        mailer.send(Mail.withText(to.value, texts.first, texts.second))
    }
}

/** Subject and body of the account emails, per language. */
internal object EmailTexts {

    fun verification(language: Language, name: String, link: String): Pair<String, String> = when (language) {
        Language.DE -> "Bestätige deine E-Mail-Adresse" to """
            Hallo $name,

            bitte bestätige deine E-Mail-Adresse für die Einkaufsliste über diesen Link:
            $link

            Falls du kein Konto angelegt hast, kannst du diese E-Mail ignorieren.
        """.trimIndent()
        Language.EN -> "Verify your email address" to """
            Hi $name,

            please confirm your email address for Shopping List by opening this link:
            $link

            If you did not create an account, you can ignore this email.
        """.trimIndent()
    }

    fun passwordReset(language: Language, name: String, link: String): Pair<String, String> = when (language) {
        Language.DE -> "Passwort zurücksetzen" to """
            Hallo $name,

            über diesen Link kannst du ein neues Passwort für die Einkaufsliste festlegen:
            $link

            Falls du das nicht angefordert hast, ignoriere diese E-Mail – dein Passwort bleibt unverändert.
        """.trimIndent()
        Language.EN -> "Reset your password" to """
            Hi $name,

            open this link to choose a new password for Shopping List:
            $link

            If you did not request this, ignore this email - your password stays unchanged.
        """.trimIndent()
    }
}

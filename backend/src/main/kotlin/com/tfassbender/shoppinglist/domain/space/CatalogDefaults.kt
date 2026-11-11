package com.tfassbender.shoppinglist.domain.space

import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.user.Language

/**
 * Starting categories and units of a new space, in the creator's language. They are ordinary data – users
 * rename, recolor or delete them as they like.
 */
object CatalogDefaults {

    private data class DefaultCategory(val key: String, val en: String, val de: String, val color: String)

    private val CATEGORIES = listOf(
        DefaultCategory("fruit-vegetables", "Fruit & vegetables", "Obst & Gemüse", "#4caf50"),
        DefaultCategory("bakery", "Bakery", "Backwaren", "#d4a056"),
        DefaultCategory("dairy", "Dairy & eggs", "Milchprodukte & Eier", "#90caf9"),
        DefaultCategory("meat-fish", "Meat & fish", "Fleisch & Fisch", "#e57373"),
        DefaultCategory("frozen", "Frozen", "Tiefkühl", "#4dd0e1"),
        DefaultCategory("pantry", "Pantry", "Vorrat", "#ffb74d"),
        DefaultCategory("drinks", "Drinks", "Getränke", "#9575cd"),
        DefaultCategory("household", "Household", "Haushalt", "#a1887f"),
        DefaultCategory("hygiene", "Hygiene", "Drogerie", "#f06292"),
    )

    private val UNITS = mapOf(
        Language.EN to listOf("pcs", "x", "g", "kg", "ml", "l", "pack", "can", "bottle"),
        Language.DE to listOf("Stk", "x", "g", "kg", "ml", "l", "Pck", "Dose", "Flasche"),
    )

    /** Category ids only need to be unique within the space, so the readable keys are used. */
    fun create(spaceId: SpaceId, language: Language): SpaceCatalog = SpaceCatalog(
        spaceId = spaceId,
        categories = CATEGORIES.map {
            Category(CategoryId(it.key), if (language == Language.DE) it.de else it.en, it.color)
        },
        units = UNITS.getValue(language),
    )
}

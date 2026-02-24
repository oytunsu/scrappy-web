# Technical Documentation: Business Data Import System (v1.0)

This documentation provides a comprehensive overview of the data architecture, normalization logic, and import workflows for the "Firma Rehberi" platform. Scrapers, AI agents, or external data providers must adhere to these specifications for seamless integration.

## 1. Core Architecture
The system is built on **Next.js (App Router)** and **Prisma ORM**. It handles data via two primary flows:
1.  **Manual JSON Import:** Triggered via admin panel file upload (`/admin/import`).
2.  **Auto-Import Background Task:** A background polling system that fetches JSON from a remote API endpoint and processes it asynchronously.

## 2. Integrated Data Model (JSON Schema)
The system expects an array of objects. All fields labeled `Business*` are mapped to the primary `Business` model.

```json
{
  "BusinessId": "unique_string_id",        // External source ID
  "BusinessName": "Gardaş Cağ Kebap",      // Raw name (Title Case normalized by system)
  "Rating": 4.5,                          // Float (0.0 - 5.0)
  "ReviewCount": 120,                     // Integer
  "Address": "Full address string",       // Critical for geocoding & deduplication
  "DirectionLink": "https://maps...",     // Navigation URL
  "PriceInfo": "·₺₺",                     // Optional price level indicator
  "OperatingHours": [                     // Structured JSON Array
    { "day": "Pazartesi", "hours": "09:00–18:00" }
  ],
  "Phone": "0216) XXX XX XX",             // Standardized during import (+90 ...)
  "ImageURL": "https://...",              // Primary thumbnail image
  "Images": ["url1", "url2"],             // Gallery images (BusinessImage Table)
  "Website": "https://...",               // Verified business website
  "Category": "Restoran",                 // Mapped to system Category slugs/icons
  "District": "Kadıköy",                  // Mapped/Created in District table
  "Reviews": [                            // Latest reviews (Review Table)
    {
      "text": "Review text content...",
      "time": "2 weeks ago",
      "author": "John Doe",
      "avatar": "https://...",
      "rating": 5,
      "images": ["url1", "url2"]          // Photos attached to reviews (ReviewImage Table)
    }
  ],
  "MenuItems": [                          // Business Menu (MenuItem Table)
    { "name": "Adana Kebap", "imageUrl": "https://..." }
  ],
  "Query": "Contextual tag",               // Search context
  "Timestamp": "2024-02-24T15:00:00Z"     // ISO track
}
```

## 3. Data Processing Pipeline

### A. Normalization (`normalizeImportItem`)
- **Cleaning:** "N/A", empty strings, or undefined values are converted to `null`.
- **Title Case:** Converts names to Turkish-specific Title Case (e.g., "İSTANBUL" -> "İstanbul").
- **Deduplication:** A unique `addressHash` is generated using a combination of `BusinessName` and `Address`. This prevents identical businesses at different locations from colliding while stopping duplicate imports of the same record.

### B. Intelligent Address Parsing (`parseAddress`)
The system doesn't rely on structured address fields. It uses a custom parser to extract:
1.  **City & District:** Detects "İlçe/İl" patterns (e.g., "Ataşehir/İstanbul").
2.  **Neighborhood (Mahalle/Semt):** Extracts keywords from the start of the address string.
3.  **Entity Seeding:** City, District, and Neighborhood records are **automatically created** if they don't exist in the database.

### C. Geocoding & Mapping
- Coordinates are resolved via **OSM Nominatim API** using the name and address.
- Results are cached to prevent redundant API calls.

## 4. Relationship Management
- **Upserting:** Matches are checked via `business_id` (External ID) AND `name + addressHash`.
- **Storage Limits:** The system stores only a configurable number of reviews (e.g., top 5) per business to maintain performance.
- **Gallery Handling:** When a business is updated, existing `BusinessImage` and `MenuItem` records are purged and replaced with the newest set from the JSON.

## 5. System Workflows

### Auto-Import (API Driven)
The system polls a defined `apiUrl` from the `SiteSetting` table.
1.  Fetches JSON data.
2.  Starts an `ImportLog` to track progress (Created/Updated/Error counts).
3.  Executes as a background process to avoid timeouts.

### UI Integration
- **Galleries:** Displayed as a responsive grid with **Lightbox** support for zoom/swipe.
- **Menu:** Displayed as item cards; images are clickable for large view.
- **Dynamic Hours:** Handles both legacy string formats and new structured JSON arrays.

---
*Documentation generated for Scraper AI integration - v1.0*

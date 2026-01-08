import prisma from "@/lib/prisma"

/**
 * Geocode an address using Google Maps Geocoding API
 */
export async function geocodeAddress(address: string, postcode?: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Get Google Maps API key from settings
    const apiKeySetting = await prisma.systemSetting.findUnique({
      where: { key: "google_maps_api_key" },
    })

    const apiKey = apiKeySetting?.isEncrypted
      ? decryptValue(apiKeySetting.value)
      : apiKeySetting?.value || process.env.GOOGLE_MAPS_API_KEY

    if (!apiKey) {
      console.error("Google Maps API key not found")
      return null
    }

    // Build address string
    const fullAddress = postcode ? `${address}, ${postcode}` : address

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`
    )

    const data = await response.json()

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location
      return {
        lat: location.lat,
        lng: location.lng,
      }
    }

    console.warn(`Geocoding failed for address: ${fullAddress}`, data.status)
    return null
  } catch (error) {
    console.error("Error geocoding address:", error)
    return null
  }
}

/**
 * Decrypt encrypted value (simple implementation - should match encryption in settings)
 */
function decryptValue(encryptedText: string): string {
  try {
    // This should match the decryption logic in email.ts or settings route
    const crypto = require("crypto")
    const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || "default-key-change-in-production"
    const ALGORITHM = "aes-256-cbc"

    const parts = encryptedText.split(":")
    if (parts.length !== 2) return encryptedText

    const iv = Buffer.from(parts[0], "hex")
    const encrypted = parts[1]
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32, "0")),
      iv
    )
    let decrypted = decipher.update(encrypted, "hex", "utf8")
    decrypted += decipher.final("utf8")
    return decrypted
  } catch (e) {
    console.error("Decryption failed:", e)
    return encryptedText
  }
}




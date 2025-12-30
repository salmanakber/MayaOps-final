import { CronJob } from "cron"
import prisma from "./prisma"

export class SheetsScheduler {
  private job: CronJob | null = null

  start() {
    // Run every 15 minutes
    this.job = new CronJob("*/15 * * * *", async () => {
      console.log("Running scheduled Google Sheets sync...")
      await this.syncAllCompanies()
    })

    this.job.start()
    console.log("Google Sheets scheduler started")
  }

  stop() {
    if (this.job) {
      this.job.stop()
      console.log("Google Sheets scheduler stopped")
    }
  }

  private async syncAllCompanies() {
    try {
      // Get all companies with active Google Sheets integrations
      // In production, store integration config in database
      const companies = await prisma.company.findMany({
        where: { subscriptionStatus: "active" },
      })

      for (const company of companies) {
        // Skip if no Google Sheets config (would be stored in a config table)
        console.log(`Syncing sheets for company: ${company.name}`)
        // Call sync logic here
      }
    } catch (error) {
      console.error("Error in scheduled sheets sync:", error)
    }
  }
}

// Export singleton
export const sheetsScheduler = new SheetsScheduler()

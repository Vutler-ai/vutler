**Health Check Report:**

**Score: 100/100**

**No issues found.**

**Details:**

1.  **Docker Container Status:** All essential containers (`vutler-mongo`, `vutler-api`, `postal-smtp`, `postal-worker`, `postal-web`, `postal-rabbitmq`, `postal-mariadb`, `vutler-redis`) are up, running, and healthy.
2.  **API Health:** The `vutler-api` (listening on `http://localhost:3001/api/v1/health`) returned a `200 OK` status.
3.  **Disk Usage:** Disk usage is at 79%, which is below the 85% alert threshold.
4.  **Memory Usage:** 921MB of free memory is available, which is above the 500MB alert threshold.
5.  **SSL Certificates:** The SSL certificate for `app.vutler.ai` is valid until May 18, 2026.
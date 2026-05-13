import express from "express";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import multer from "multer";
import path from "path";
import dotenv from "dotenv";
import Database from "better-sqlite3";

dotenv.config();

// Initialize SQLite Database
const db = new Database("reports.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS email_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT NOT NULL,
    filename TEXT
  )
`);

// Configure SMTP Transporter with Pooling for better performance in Bulk sending
const transporter = nodemailer.createTransport({
  pool: true, // Reuse connections
  maxConnections: 5,
  maxMessages: 100,
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true", 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Configure Multer for memory storage
  const storage = multer.memoryStorage();
  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit (matching common SMTP limits)
  });

  app.use(express.json());

  // API Route to fetch reports
  app.get("/api/reports", (req, res) => {
    try {
      const reports = db.prepare("SELECT * FROM email_reports ORDER BY timestamp DESC").all();
      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Route to test SMTP connection
  app.get("/api/test-smtp", async (req, res) => {
    try {
      await transporter.verify();
      res.json({ success: true, message: "Koneksi SMTP Berhasil!" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Koneksi SMTP Gagal" });
    }
  });

  // API Route to retry a failed email
  app.post("/api/retry-email/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const report: any = db.prepare("SELECT * FROM email_reports WHERE id = ?").get(id);
      if (!report) return res.status(404).json({ error: "Report not found" });
      if (report.status === 'success') return res.status(400).json({ error: "Email already sent successfully" });

      const mailOptions = {
        from: `"KOPSYAH YKK AP" <${process.env.SMTP_USER}>`,
        to: report.recipient,
        subject: report.subject,
        text: "Terlampir adalah dokumen slip gaji/potongan koperasi Anda (Kirim Ulang).\n\nTerima kasih,\nKOPSYAH YKK AP",
        // Note: In a real app, you'd store the body and file paths. 
        // For now, we retry with basic info or handle logic as needed.
      };

      await transporter.sendMail(mailOptions);
      
      db.prepare("UPDATE email_reports SET status = 'success', error = NULL WHERE id = ?").run(id);
      res.json({ success: true, message: "Email resent successfully" });
    } catch (error: any) {
      db.prepare("UPDATE email_reports SET error = ? WHERE id = ?").run(error.message, id);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route to send email
  app.post("/api/send-email", upload.array("attachments"), async (req, res) => {
    const { to, subject, body, type } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!to || !subject || !body) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const reportType = type || (files.length > 1 ? 'bulk' : 'single');

    try {
      const mailOptions = {
        from: `"KOPSYAH YKK AP" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text: body,
        attachments: files.map(file => ({
          filename: file.originalname,
          content: file.buffer
        }))
      };

      const info = await transporter.sendMail(mailOptions);
      
      // Log success to DB with SMTP response info
      db.prepare(`
        INSERT INTO email_reports (recipient, subject, status, type, filename, timestamp)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(to, subject, 'success', reportType, files.map(f => f.originalname).join(', '));

      res.json({ success: true, message: `Email sent to ${to}`, info: info.response });
    } catch (error: any) {
      console.error(`Error sending email to ${to}:`, error);
      
      // Extract detailed SMTP error if available
      let errorMsg = error.message;
      if (error.response) {
        errorMsg = `SMTP Error: ${error.responseCode} - ${error.response}`;
      }
      
      db.prepare(`
        INSERT INTO email_reports (recipient, subject, status, error, type, filename, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(to, subject, 'error', errorMsg, reportType, files.map(f => f.originalname).join(', '));

      res.status(500).json({ error: errorMsg });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

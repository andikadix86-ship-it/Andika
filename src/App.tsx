import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Send, 
  FileText, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Mail, 
  Paperclip,
  Building2,
  Users,
  User as UserIcon,
  Upload,
  Download,
  History,
  Trash2,
  Play,
  BarChart3,
  FileSpreadsheet,
  Video
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

interface FileWithPreview extends File {
  preview?: string;
}

interface Recipient {
  email: string;
  filename: string;
  status: 'pending' | 'sending' | 'success' | 'error';
  error?: string;
}

type Tab = 'single' | 'bulk' | 'reports';

interface EmailReport {
  id: number;
  recipient: string;
  subject: string;
  status: 'success' | 'error';
  error?: string;
  timestamp: string;
  type: 'single' | 'bulk';
  filename?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('single');
  
  // Reports State
  const [reports, setReports] = useState<EmailReport[]>([]);
  const [isReportsLoading, setIsReportsLoading] = useState(false);

  // Filter State
  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'error'>('all');
  const [filterType, setFilterType] = useState<'all' | 'single' | 'bulk'>('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
      const matchesType = filterType === 'all' || r.type === filterType;
      
      let matchesDate = true;
      if (filterStartDate || filterEndDate) {
        const reportDate = new Date(r.timestamp).setHours(0,0,0,0);
        if (filterStartDate) {
          const start = new Date(filterStartDate).setHours(0,0,0,0);
          if (reportDate < start) matchesDate = false;
        }
        if (filterEndDate) {
          const end = new Date(filterEndDate).setHours(0,0,0,0);
          if (reportDate > end) matchesDate = false;
        }
      }
      
      return matchesStatus && matchesType && matchesDate;
    });
  }, [reports, filterStatus, filterType, filterStartDate, filterEndDate]);

  // Fetch Reports
  const fetchReports = async () => {
    setIsReportsLoading(true);
    try {
      const response = await fetch('/api/reports');
      const data = await response.json();
      if (response.ok) {
        setReports(data);
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setIsReportsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReports();
    }
  }, [activeTab]);

  const exportToExcel = () => {
    if (filteredReports.length === 0) return;

    // Create a new workbook
    const wb = XLSX.utils.book_new();

    // 1. All Reports Data
    const allData = filteredReports.map(r => ({
      'Tanggal': new Date(r.timestamp).toLocaleString('id-ID'),
      'Penerima': r.recipient,
      'Subjek': r.subject,
      'Tipe': r.type === 'single' ? 'Satuan' : 'Bulk',
      'File': r.filename || '-',
      'Status': r.status === 'success' ? 'Terkirim' : 'Gagal',
      'Keterangan': r.error || '-'
    }));
    const allSheet = XLSX.utils.json_to_sheet(allData);
    XLSX.utils.book_append_sheet(wb, allSheet, "Semua Laporan");

    // 2. Success Reports Data
    const successReports = filteredReports.filter(r => r.status === 'success');
    if (successReports.length > 0) {
      const successData = successReports.map(r => ({
        'Tanggal': new Date(r.timestamp).toLocaleString('id-ID'),
        'Penerima': r.recipient,
        'Subjek': r.subject,
        'Tipe': r.type === 'single' ? 'Satuan' : 'Bulk',
        'File': r.filename || '-',
        'Status': 'Terkirim'
      }));
      const successSheet = XLSX.utils.json_to_sheet(successData);
      XLSX.utils.book_append_sheet(wb, successSheet, "Email Berhasil");
    }

    // 3. Error Reports Data
    const errorReports = filteredReports.filter(r => r.status === 'error');
    if (errorReports.length > 0) {
      const errorData = errorReports.map(r => ({
        'Tanggal': new Date(r.timestamp).toLocaleString('id-ID'),
        'Penerima': r.recipient,
        'Subjek': r.subject,
        'Tipe': r.type === 'single' ? 'Satuan' : 'Bulk',
        'File': r.filename || '-',
        'Status': 'Gagal',
        'Keterangan': r.error || '-'
      }));
      const errorSheet = XLSX.utils.json_to_sheet(errorData);
      XLSX.utils.book_append_sheet(wb, errorSheet, "Email Gagal");
    }

    // Generate Excel file and trigger download
    XLSX.writeFile(wb, `Report_Email_KOPSYAH_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const retrySingleEmail = async (id: number) => {
    try {
      const res = await fetch(`/api/retry-email/${id}`, { method: 'POST' });
      return res.ok;
    } catch (e) {
      return false;
    }
  };

  const handleRetryEmail = async (id: number) => {
    const success = await retrySingleEmail(id);
    if (success) {
      alert('✅ Email dikirim ulang dan berhasil!');
      fetchReports();
    } else {
      alert('❌ Gagal kirim ulang');
    }
  };

  const handleRetryAllFailed = async () => {
    const failedReports = reports.filter(r => r.status === 'error');
    if (failedReports.length === 0) return;
    
    if (!window.confirm(`Kirim ulang ${failedReports.length} email yang gagal?`)) return;

    setIsReportsLoading(true);
    let successCount = 0;
    for (const report of failedReports) {
      const success = await retrySingleEmail(report.id);
      if (success) successCount++;
      // Optional: Add a small delay if needed
    }
    
    alert(`✅ Selesai! ${successCount} dari ${failedReports.length} email berhasil terkirim ulang.`);
    fetchReports();
  };
  
  // Single Mode State
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('Slip Gaji / Potongan Koperasi - KOPSYAH YKK AP');
  const [body, setBody] = useState('Halo,\n\nTerlampir adalah dokumen slip gaji/potongan koperasi Anda.\n\nTerima kasih,\nKOPSYAH YKK AP');
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: '',
  });

  // Bulk Mode State
  const [rawRecipients, setRawRecipients] = useState<any[]>([]);
  const [bulkFiles, setBulkFiles] = useState<FileWithPreview[]>([]);
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [useCommonFile, setUseCommonFile] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<Record<string, { status: Recipient['status'], error?: string }>>({});
  const [sendDelay, setSendDelay] = useState(2); // delay in seconds
  const [useJitter, setUseJitter] = useState(true);

  const recipients = useMemo(() => {
    return rawRecipients
      .map(row => ({
        email: (row.email || row.penerima || '').trim(),
        filename: (row.filename || row.file || '').trim(),
        status: 'pending' as const
      }))
      .filter(r => r.email && (useCommonFile || r.filename));
  }, [rawRecipients, useCommonFile]);

  // Single Mode Dropzone
  const onDropSingle = useCallback((acceptedFiles: File[]) => {
    const filesWithPreviews = acceptedFiles.map(file => Object.assign(file, {
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }));
    setFiles(prev => [...prev, ...filesWithPreviews]);
  }, []);

  const { getRootProps: getRootPropsSingle, getInputProps: getInputPropsSingle, isDragActive: isDragActiveSingle } = useDropzone({
    onDrop: onDropSingle,
    accept: { 
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'video/mp4': ['.mp4'],
      'video/mpeg': ['.mpeg'],
      'video/quicktime': ['.mov'],
      'video/x-msvideo': ['.avi']
    },
    multiple: true
  } as any);

  // Bulk Mode Dropzones
  const onDropBulkFiles = useCallback((acceptedFiles: File[]) => {
    const filesWithPreviews = acceptedFiles.map(file => Object.assign(file, {
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }));
    setBulkFiles(prev => [...prev, ...filesWithPreviews]);
  }, []);

  const { getRootProps: getRootPropsBulkFiles, getInputProps: getInputPropsBulkFiles, isDragActive: isDragActiveBulkFiles } = useDropzone({
    onDrop: onDropBulkFiles,
    accept: { 
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'video/mp4': ['.mp4'],
      'video/mpeg': ['.mpeg'],
      'video/quicktime': ['.mov'],
      'video/x-msvideo': ['.avi']
    },
    multiple: true
  } as any);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.toLowerCase().trim(),
      complete: (results) => {
        const data = results.data as any[];
        if (data.length === 0) {
          alert('File CSV kosong.');
          return;
        }
        setRawRecipients(data);
      },
      error: (error) => {
        console.error('CSV Parsing Error:', error);
        alert('Gagal membaca file CSV. Pastikan format benar.');
      }
    });
    // Reset input value to allow re-uploading the same file
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    const file = files[index];
    if (file.preview) URL.revokeObjectURL(file.preview);
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeBulkFile = (index: number) => {
    const file = bulkFiles[index];
    if (file.preview) URL.revokeObjectURL(file.preview);
    setBulkFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearBulk = () => {
    if (window.confirm('Hapus semua data bulk?')) {
      setRawRecipients([]);
      setBulkFiles([]);
      setBulkStatus({});
    }
  };

  const handleSendSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to || files.length === 0) {
      setStatus({ type: 'error', message: 'Mohon isi email penerima dan lampirkan file PDF.' });
      return;
    }

    if (!isValidEmail(to)) {
      setStatus({ type: 'error', message: 'Format email penerima tidak valid.' });
      return;
    }

    setIsSending(true);
    setStatus({ type: null, message: '' });

    const formData = new FormData();
    formData.append('to', to);
    formData.append('subject', subject);
    formData.append('body', body);
    files.forEach(file => formData.append('attachments', file));

      try {
        const response = await fetch('/api/send-email', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        if (response.ok) {
          setStatus({ type: 'success', message: 'Email berhasil dikirim!' });
          setFiles([]);
          setTo('');
        } else {
          throw new Error(data.error || 'Gagal mengirim email');
        }
      } catch (error: any) {
        setStatus({ type: 'error', message: error.message });
      } finally {
        setIsSending(false);
      }
  };

  const handleSendBulk = async () => {
    if (recipients.length === 0) {
      alert('Mohon import daftar penerima (CSV) terlebih dahulu.');
      return;
    }
    if (bulkFiles.length === 0) {
      alert('Mohon upload file PDF yang akan dikirim.');
      return;
    }

    // Hitung ringkasan status saat ini
    const totalCount = recipients.length;
    const successCount = recipients.filter(r => bulkStatus[r.email]?.status === 'success').length;
    const errorCount = recipients.filter(r => bulkStatus[r.email]?.status === 'error').length;
    const pendingCount = recipients.filter(r => !bulkStatus[r.email] || bulkStatus[r.email].status === 'pending').length;
    const toSend = errorCount + pendingCount;
    
    if (toSend === 0) {
      alert('Semua email dalam daftar sudah berhasil terkirim sebelumnya.');
      return;
    }

    // Email Validation for Bulk
    const invalidEmails = recipients
      .filter(r => bulkStatus[r.email]?.status !== 'success' && !isValidEmail(r.email))
      .map(r => r.email);

    if (invalidEmails.length > 0) {
      alert(`Ditemukan ${invalidEmails.length} format email tidak valid:\n${invalidEmails.slice(0, 5).join(', ')}${invalidEmails.length > 5 ? '...' : ''}\n\nMohon perbaiki data CSV Anda.`);
      return;
    }

    // Modal konfirmasi ringkasan terperinci
    const confirmSend = window.confirm(
      `RINGKASAN PENGIRIMAN MASSAL\n\n` +
      `• Total Penerima: ${totalCount}\n` +
      `• Sudah Terkirim: ${successCount}\n` +
      `• Belum Terkirim: ${pendingCount}\n` +
      `• Gagal (Akan Dicoba Lagi): ${errorCount}\n\n` +
      `JUMLAH YANG AKAN DIPROSES: ${toSend}\n\n` +
      `Lanjutkan pengiriman massal sekarang?`
    );

    if (!confirmSend) return;

    setIsBulkSending(true);

    // Process one by one to avoid overwhelming the server and provide real-time feedback
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      
      // Skip if already success
      if (bulkStatus[recipient.email]?.status === 'success') continue;

      setBulkStatus(prev => ({ ...prev, [recipient.email]: { status: 'sending' } }));

      let matchingFiles: File[] = [];
      if (useCommonFile) {
        matchingFiles = bulkFiles;
      } else {
        const matchingFile = bulkFiles.find(f => {
          const fileName = f.name.toLowerCase();
          const targetName = recipient.filename.toLowerCase();
          // Support various extensions or exact match
          const baseFileName = fileName.replace(/\.[^/.]+$/, "");
          const targetBaseName = targetName.replace(/\.[^/.]+$/, "");
          
          return fileName === targetName || baseFileName === targetName || baseFileName === targetBaseName;
        });
        if (matchingFile) matchingFiles = [matchingFile];
      }

      if (matchingFiles.length === 0) {
        setBulkStatus(prev => ({ 
          ...prev, 
          [recipient.email]: { status: 'error', error: useCommonFile ? 'Pilih lampiran' : 'File tidak ditemukan' } 
        }));
        continue;
      }

      const formData = new FormData();
      formData.append('to', recipient.email);
      formData.append('subject', subject);
      formData.append('body', body);
      matchingFiles.forEach(file => formData.append('attachments', file));

      try {
        const response = await fetch('/api/send-email', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        
        if (response.ok) {
          setBulkStatus(prev => ({ ...prev, [recipient.email]: { status: 'success' } }));
        } else {
          setBulkStatus(prev => ({ ...prev, [recipient.email]: { status: 'error', error: data.error || 'Gagal kirim' } }));
        }
      } catch (error: any) {
        setBulkStatus(prev => ({ ...prev, [recipient.email]: { status: 'error', error: error.message } }));
      }

      // Dynamic delay between emails to avoid spam filters
      const baseDelay = sendDelay * 1000;
      const jitter = useJitter ? Math.random() * 1000 : 0; // Add up to 1 second of random jitter
      await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
    }

    setIsBulkSending(false);
  };

  const downloadCsvTemplate = () => {
    const csvContent = useCommonFile 
      ? "email\nkaryawan1@example.com\nkaryawan2@example.com"
      : "email,filename\nkaryawan1@example.com,slip_januari_001.pdf\nkaryawan2@example.com,slip_januari_002.pdf";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = useCommonFile ? 'template_email_list.csv' : 'template_kopsyah_bulk.csv';
    a.click();
  };

  // Cleanup object URLs for previews on unmount
  useEffect(() => {
    return () => {
      files.forEach(file => {
        if (file.preview) URL.revokeObjectURL(file.preview);
      });
      bulkFiles.forEach(file => {
        if (file.preview) URL.revokeObjectURL(file.preview);
      });
    };
  }, []); // Only on unmount

  const stats = useMemo(() => {
    const total = recipients.length;
    const success = recipients.filter(r => bulkStatus[r.email]?.status === 'success').length;
    const error = recipients.filter(r => bulkStatus[r.email]?.status === 'error').length;
    const pending = recipients.filter(r => !bulkStatus[r.email] || bulkStatus[r.email].status === 'pending').length;
    return { total, success, error, pending };
  }, [recipients, bulkStatus]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg">
              <Building2 className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800">KOPSYAH YKK AP</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Email Document Sender</p>
            </div>
          </div>
          
          <nav className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('single')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'single' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <UserIcon className="w-4 h-4" />
              Single
            </button>
            <button 
              onClick={() => setActiveTab('bulk')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'bulk' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Users className="w-4 h-4" />
              Bulk
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'reports' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <BarChart3 className="w-4 h-4" />
              Reports
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/test-smtp');
                  const data = await res.json();
                  if (res.ok) alert('✅ ' + data.message);
                  else alert('❌ ' + data.error);
                } catch (e) {
                  alert('❌ Gagal menghubungi server');
                }
              }}
              className="hidden sm:block text-[10px] font-bold text-slate-400 hover:text-emerald-600 uppercase tracking-widest border border-slate-200 px-3 py-1.5 rounded-lg transition-all"
            >
              Test SMTP
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Form / Config */}
          <div className="lg:col-span-7 space-y-6">
            
            {activeTab === 'reports' ? (
                <motion.div
                  key="reports"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-lg font-bold text-slate-800">Laporan Pengiriman</h2>
                        <p className="text-xs text-slate-500">Riwayat pengiriman email satuan dan bulk</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {filteredReports.some(r => r.status === 'error') && (
                          <button 
                            onClick={handleRetryAllFailed}
                            disabled={isReportsLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-700 rounded-xl hover:bg-orange-100 transition-all text-sm font-bold border border-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Play className="w-4 h-4" />
                            Retry Gagal (Filtered)
                          </button>
                        )}
                        <button 
                          onClick={exportToExcel}
                          disabled={filteredReports.length === 0}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-all text-sm font-bold border border-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          Ekspor Excel
                        </button>
                      </div>
                    </div>

                    {/* Global Summary Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                      <div className="bg-emerald-600 rounded-2xl p-6 text-white shadow-xl shadow-emerald-600/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                          <Send className="w-20 h-20" />
                        </div>
                        <div className="relative z-10">
                          <p className="text-[10px] font-bold text-emerald-200 uppercase tracking-[0.2em] mb-1">Total Eksekusi (All Time)</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-4xl font-black leading-none">{reports.length}</p>
                            <p className="text-xs font-bold text-emerald-200 uppercase">Email</p>
                          </div>
                          <div className="mt-6 flex items-center gap-4 bg-emerald-700/30 p-3 rounded-xl backdrop-blur-sm border border-emerald-500/20">
                            <div className="flex-1">
                              <p className="text-[9px] font-bold text-emerald-300 uppercase mb-0.5">Sukses</p>
                              <p className="text-sm font-bold">{reports.filter(r => r.status === 'success').length}</p>
                            </div>
                            <div className="w-px h-6 bg-emerald-500/30" />
                            <div className="flex-1 text-right">
                              <p className="text-[9px] font-bold text-emerald-300 uppercase mb-0.5">Gagal</p>
                              <p className="text-sm font-bold">{reports.filter(r => r.status === 'error').length}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative group">
                        <div className="absolute top-0 right-0 p-4">
                          <Loader2 className={cn("w-12 h-12 text-slate-100 transition-colors duration-500", stats.pending > 0 && "animate-spin text-emerald-100")} />
                        </div>
                        <div className="relative z-10">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={cn("w-1.5 h-1.5 rounded-full", stats.pending > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Antrean Aktif (Bulk)</p>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <p className={cn("text-4xl font-black leading-none", stats.pending > 0 ? "text-emerald-600" : "text-slate-800")}>
                              {stats.pending}
                            </p>
                            <p className="text-xs font-bold text-slate-400 uppercase">Penerima</p>
                          </div>
                          <div className="mt-6">
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-emerald-500 h-full transition-all duration-1000 ease-out" 
                                style={{ width: stats.total > 0 ? `${(stats.success / stats.total) * 100}%` : '0%' }}
                              />
                            </div>
                            <div className="flex justify-between mt-2">
                              <p className="text-[10px] font-medium text-slate-500 italic">
                                {stats.pending > 0 ? 'Proses bulk sedang berjalan...' : 'Tidak ada antrean pengiriman aktif'}
                              </p>
                              {stats.total > 0 && (
                                <p className="text-[10px] font-bold text-emerald-600 uppercase">
                                  {Math.round((stats.success / stats.total) * 100)}% Selesai
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Status</label>
                        <select 
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value as any)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 outline-none"
                        >
                          <option value="all">Semua Status</option>
                          <option value="success">Sukses</option>
                          <option value="error">Gagal</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Tipe</label>
                        <select 
                          value={filterType}
                          onChange={(e) => setFilterType(e.target.value as any)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 outline-none"
                        >
                          <option value="all">Semua Tipe</option>
                          <option value="single">Satuan</option>
                          <option value="bulk">Bulk</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Mulai</label>
                        <input 
                          type="date" 
                          value={filterStartDate}
                          onChange={(e) => setFilterStartDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Selesai</label>
                        <input 
                          type="date" 
                          value={filterEndDate}
                          onChange={(e) => setFilterEndDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Terfilter</p>
                        <p className="text-2xl font-bold text-slate-800">{filteredReports.length}</p>
                      </div>
                      <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1">Sukses</p>
                        <p className="text-2xl font-bold text-emerald-600">{filteredReports.filter(r => r.status === 'success').length}</p>
                      </div>
                      <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                        <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Gagal</p>
                        <p className="text-2xl font-bold text-red-600">{filteredReports.filter(r => r.status === 'error').length}</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                            <th className="px-4 py-3">Waktu</th>
                            <th className="px-4 py-3">Penerima</th>
                            <th className="px-4 py-3">Subjek</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Tipe / File / Error</th>
                            <th className="px-4 py-3">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {isReportsLoading ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-10 text-center">
                                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                              </td>
                            </tr>
                          ) : filteredReports.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-10 text-center text-slate-400 italic text-sm">
                                Tidak ditemukan data yang cocok dengan filter.
                              </td>
                            </tr>
                          ) : (
                            filteredReports.map((r) => (
                              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3">
                                  <p className="text-[10px] text-slate-500 whitespace-nowrap">
                                    {new Date(r.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                                  </p>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-xs font-bold text-slate-700 truncate max-w-[150px]" title={r.recipient}>{r.recipient}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-[10px] text-slate-600 truncate max-w-[120px]" title={r.subject}>{r.subject}</p>
                                </td>
                                <td className="px-4 py-3">
                                  {r.status === 'success' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold uppercase">
                                      <CheckCircle2 className="w-3 h-3" /> Sukses
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-bold uppercase">
                                      <AlertCircle className="w-3 h-3" /> Gagal
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase">{r.type}</span>
                                      {r.filename && (
                                        <span className="text-[9px] text-slate-500 font-mono truncate max-w-[100px]" title={r.filename}>{r.filename}</span>
                                      )}
                                    </div>
                                    {r.error && (
                                      <span className="text-[10px] text-red-400 italic font-medium truncate max-w-[150px]" title={r.error}>
                                        {r.error}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {r.status === 'error' && (
                                    <button
                                      onClick={() => handleRetryEmail(r.id)}
                                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                      title="Kirim Ulang"
                                    >
                                      <Play className="w-4 h-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <>
                  {/* Common Message Config */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <History className="w-4 h-4 text-emerald-600" />
                      Konfigurasi Pesan
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Subjek Email</label>
                        <input
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Isi Pesan</label>
                        <textarea
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          rows={4}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none resize-none text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {activeTab === 'single' ? (
                    <motion.div 
                      key="single"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8"
                    >
                      <form onSubmit={handleSendSingle} className="space-y-6">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Penerima</label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                              type="email"
                              value={to}
                              onChange={(e) => setTo(e.target.value)}
                              placeholder="karyawan@example.com"
                              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-slate-700">Lampiran (PDF/Gambar/Video)</label>
                          <div
                            {...getRootPropsSingle()}
                            className={cn(
                              "border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-3",
                              isDragActiveSingle ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300 bg-slate-50"
                            )}
                          >
                            <input {...getInputPropsSingle()} />
                            <div className="bg-white p-3 rounded-full shadow-sm border border-slate-100">
                              <Paperclip className={cn("w-6 h-6", isDragActiveSingle ? "text-emerald-600" : "text-slate-400")} />
                            </div>
                            <p className="text-sm font-semibold text-slate-700">Klik atau seret file PDF, Gambar, atau Video</p>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isSending}
                          className={cn(
                            "w-full py-3.5 rounded-xl font-bold text-white shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2",
                            isSending ? "bg-emerald-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]"
                          )}
                        >
                          {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                          Kirim Sekarang
                        </button>
                      </form>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="bulk"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-6"
                    >
                      {/* Bulk Controls */}
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        {/* Common File Toggle */}
                        <div className="mb-6 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-2 rounded-lg",
                              useCommonFile ? "bg-emerald-600 text-white" : "bg-white text-slate-400 border border-slate-200"
                            )}>
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">Gunakan Satu File Lampiran</p>
                              <p className="text-[10px] text-slate-500">Kirim file yang sama ke semua penerima di daftar CSV</p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setUseCommonFile(!useCommonFile);
                              setBulkFiles([]); // Clear files when switching mode to avoid confusion
                            }}
                            className={cn(
                              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                              useCommonFile ? "bg-emerald-600" : "bg-slate-200"
                            )}
                          >
                            <span
                              className={cn(
                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                useCommonFile ? "translate-x-6" : "translate-x-1"
                              )}
                            />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">1. Import Daftar (CSV)</label>
                            <div className="flex gap-2">
                              <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer transition-all text-sm font-bold border border-slate-200">
                                <Upload className="w-4 h-4" />
                                {useCommonFile ? 'Upload List Email' : 'Upload CSV'}
                                <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
                              </label>
                              <button 
                                onClick={downloadCsvTemplate}
                                className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 rounded-xl transition-all"
                                title="Download Template CSV"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                              {useCommonFile ? '2. Upload Lampiran (Bisa Banyak)' : '2. Upload Semua File'}
                            </label>
                            <div {...getRootPropsBulkFiles()} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer transition-all text-sm font-bold border border-slate-200">
                              <input {...getInputPropsBulkFiles()} />
                              <Paperclip className="w-4 h-4" />
                              {useCommonFile ? 'Pilih Lampiran' : 'Pilih Banyak File'}
                            </div>
                          </div>
                        </div>

                        {/* Anti-Spam Settings */}
                        <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <History className="w-4 h-4 text-emerald-600" />
                              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Jeda Pengiriman (Anti-Spam)</h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Input Manual:</span>
                              <input 
                                type="number" 
                                value={sendDelay}
                                onChange={(e) => setSendDelay(Math.max(0.5, Number(e.target.value)))}
                                className="w-12 px-2 py-1 text-[10px] font-bold bg-white border border-slate-200 rounded text-center"
                              />
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Detik</span>
                            </div>
                          </div>
                          
                          <div className="space-y-4">
                            <div className="flex items-center gap-4">
                              <div className="flex-1">
                                <input 
                                  type="range" 
                                  min="0.5" 
                                  max="10" 
                                  step="0.5" 
                                  value={sendDelay}
                                  onChange={(e) => setSendDelay(Number(e.target.value))}
                                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                                />
                                <div className="flex justify-between mt-1">
                                  <span className="text-[9px] text-slate-400">0.5s</span>
                                  <span className="text-[10px] font-bold text-emerald-600">{sendDelay} detik</span>
                                  <span className="text-[9px] text-slate-400">10s</span>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl">
                                <label className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer">Jitter</label>
                                <button
                                  onClick={() => setUseJitter(!useJitter)}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
                                    useJitter ? "bg-emerald-600" : "bg-slate-200"
                                  )}
                                >
                                  <span className={cn(
                                    "inline-block h-2 w-2 transform rounded-full bg-white transition-transform",
                                    useJitter ? "translate-x-4" : "translate-x-1"
                                  )} />
                                </button>
                              </div>
                            </div>
                            
                            <p className="text-[10px] text-slate-400 italic">
                               * Rekomendasi: Gunakan jeda minimal 2-3 detik dengan fitur 'Jitter' aktif agar pola pengiriman tidak terdeteksi sebagai bot oleh server Gmail.
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
                          <div className="flex gap-4">
                            <div className="text-center">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Total</p>
                              <p className="text-lg font-bold text-slate-700">{stats.total}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[10px] font-bold text-emerald-500 uppercase">Sukses</p>
                              <p className="text-lg font-bold text-emerald-600">{stats.success}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[10px] font-bold text-red-400 uppercase">Gagal</p>
                              <p className="text-lg font-bold text-red-600">{stats.error}</p>
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            <button 
                              onClick={clearBulk}
                              className="px-4 py-2.5 text-slate-400 hover:text-red-500 font-bold text-sm transition-all"
                            >
                              Reset
                            </button>
                            <button 
                              onClick={handleSendBulk}
                              disabled={isBulkSending || recipients.length === 0 || bulkFiles.length === 0}
                              className={cn(
                                "px-6 py-2.5 rounded-xl font-bold text-white shadow-lg transition-all flex items-center gap-2",
                                (isBulkSending || recipients.length === 0 || bulkFiles.length === 0) 
                                  ? "bg-slate-300 cursor-not-allowed shadow-none" 
                                  : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                              )}
                            >
                              {isBulkSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                              Mulai Kirim
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Bulk Log Table */}
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                          <h3 className="text-sm font-bold text-slate-800">Log Pengiriman Bulk</h3>
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase">Real-time</span>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                          <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white shadow-sm z-10">
                              <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                <th className="px-6 py-3">Penerima</th>
                                <th className="px-6 py-3">File</th>
                                <th className="px-6 py-3 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {recipients.length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                                    Belum ada data. Silakan import CSV.
                                  </td>
                                </tr>
                              ) : (
                                recipients.map((r, idx) => {
                                  const s = bulkStatus[r.email] || { status: 'pending' };
                                  return (
                                    <tr key={`${r.email}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                      <td className="px-6 py-3">
                                        <p className="text-xs font-bold text-slate-700">{r.email}</p>
                                      </td>
                                      <td className="px-6 py-3">
                                        <p className="text-[10px] text-slate-500 font-mono">{useCommonFile ? '-' : r.filename}</p>
                                      </td>
                                      <td className="px-6 py-3">
                                        <div className="flex justify-center">
                                          {s.status === 'pending' && <div className="w-2 h-2 rounded-full bg-slate-200" />}
                                          {s.status === 'sending' && <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />}
                                          {s.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                          {s.status === 'error' && (
                                            <div className="group relative">
                                              <AlertCircle className="w-4 h-4 text-red-500 cursor-help" />
                                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                                {s.error}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </div>

            {/* Right Column: File List & Info */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* File List */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    File Terpilih ({activeTab === 'single' ? files.length : bulkFiles.length})
                  </h2>
                  {(activeTab === 'single' ? files.length : bulkFiles.length) > 0 && (
                    <button 
                      onClick={() => activeTab === 'single' ? setFiles([]) : setBulkFiles([])}
                      className="text-[10px] font-bold text-red-500 hover:underline uppercase"
                    >
                      Hapus Semua
                    </button>
                  )}
                </div>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {(activeTab === 'single' ? files : bulkFiles).length === 0 ? (
                    <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-xl">
                      <p className="text-xs text-slate-400 italic">Belum ada file</p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {(activeTab === 'single' ? files : bulkFiles).map((file, index) => (
                        <motion.div
                          key={`${file.name}-${index}`}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="group flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-emerald-200 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {file.preview ? (
                              <div className="w-8 h-8 rounded-lg border border-slate-200 overflow-hidden shrink-0">
                                <img src={file.preview} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </div>
                            ) : file.type.startsWith('video/') ? (
                              <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100 shrink-0">
                                <Video className="w-4 h-4 text-emerald-500" />
                              </div>
                            ) : (
                              <div className="bg-red-50 p-2 rounded-lg border border-red-100 shrink-0">
                                <FileText className="w-4 h-4 text-red-500" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-700 truncate">{file.name}</p>
                              <p className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                          <button
                            onClick={() => activeTab === 'single' ? removeFile(index) : removeBulkFile(index)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </div>

              {/* Info Card */}
              <div className="bg-emerald-900 rounded-2xl p-6 text-white shadow-xl shadow-emerald-900/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Building2 className="w-24 h-24" />
                </div>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-emerald-400" />
                  Sistem Bulk KOPSYAH
                </h3>
                <div className="space-y-4 relative z-10">
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-emerald-400 uppercase">Format CSV</p>
                    <p className="text-[10px] text-emerald-100/70 leading-relaxed">
                      File CSV harus memiliki kolom <code className="bg-emerald-800 px-1 rounded">email</code>{useCommonFile ? '' : <> dan <code className="bg-emerald-800 px-1 rounded">filename</code></>}.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-emerald-400 uppercase">{useCommonFile ? 'Lampiran Massal' : 'Pencocokan File'}</p>
                    <p className="text-[10px] text-emerald-100/70 leading-relaxed">
                      {useCommonFile 
                        ? 'Satu atau beberapa file (PDF/Gambar/Video) yang diupload akan dikirimkan ke semua alamat email yang ada dalam daftar CSV.'
                        : 'Sistem akan mencocokkan nama file di CSV dengan file PDF, Gambar, atau Video yang Anda upload. Pastikan nama file persis sama.'}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-emerald-800">
                    <p className="text-[10px] italic text-emerald-300">
                      * Pengiriman dilakukan satu per satu untuk memastikan stabilitas server SMTP.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 py-12 text-center border-t border-slate-200 mt-10">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Building2 className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">KOPSYAH YKK AP</span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium max-w-md">
            Sistem Pengiriman Dokumen Digital Aman & Terintegrasi. 
            Dikembangkan untuk efisiensi operasional koperasi.
          </p>
          <p className="text-[10px] text-slate-300">
            &copy; {new Date().getFullYear()} KOPSYAH YKK AP.
          </p>
        </div>
      </footer>

      {/* Global Status Toast for Single Mode */}
      <AnimatePresence>
        {status.type && activeTab === 'single' && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
          >
            <div className={cn(
              "px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border",
              status.type === 'success' ? "bg-white border-emerald-100 text-emerald-700" : "bg-white border-red-100 text-red-700"
            )}>
              {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <span className="text-sm font-bold">{status.message}</span>
              <button onClick={() => setStatus({ type: null, message: '' })} className="ml-2 p-1 hover:bg-slate-100 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

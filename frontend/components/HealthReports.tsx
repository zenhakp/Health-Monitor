"use client";
import { useState, useRef } from "react";
import { reportApi } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import { Upload, FileText, Image, ExternalLink, Plus, X, Download, Eye } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import Cookies from "js-cookie";

interface Report {
  id: string;
  original_name: string;
  file_type: string;
  description: string;
  uploaded_at: string;
}

interface HealthReportsProps {
  reports: Report[];
  canUpload: boolean;
  onUploadSuccess: () => void;
}

export default function HealthReports({ reports, canUpload, onUploadSuccess }: HealthReportsProps) {
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [viewBlob, setViewBlob] = useState<string | null>(null);
  const [loadingView, setLoadingView] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const getToken = () => Cookies.get("access_token") || "";

  const handleUpload = async () => {
    if (!selectedFile) { toast.error("Select a file first"); return; }
    setUploading(true);
    try {
      await reportApi.upload(selectedFile, description);
      toast.success("Health report uploaded successfully");
      setShowUpload(false);
      setSelectedFile(null);
      setDescription("");
      onUploadSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const openReport = async (report: Report) => {
    setViewingReport(report);
    setLoadingView(true);
    setViewBlob(null);
    try {
      // Fetch the file as a blob using axios with auth token
      const token = getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/reports/view/${report.id}?token=${token}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setViewBlob(url);
    } catch (err: any) {
      toast.error("Failed to load file — try downloading instead");
      setViewBlob(null);
    } finally {
      setLoadingView(false);
    }
  };

  const closeViewer = () => {
    if (viewBlob) URL.revokeObjectURL(viewBlob);
    setViewingReport(null);
    setViewBlob(null);
  };

  const openInNewTab = (report: Report) => {
    const token = getToken();
    const proxyUrl = `/api/report-proxy/${report.id}?token=${token}`;
    window.open(proxyUrl, "_blank");
  };

  const downloadReport = (report: Report) => {
    const token = getToken();
    const link = document.createElement("a");
    link.href = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/reports/view/${report.id}?token=${token}`;
    link.download = report.original_name;
    link.click();
  };

  return (
    <div>
      {canUpload && (
        <div className="mb-4">
          {!showUpload ? (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 text-sm bg-dark-900 border border-dark-600 hover:border-blue-500/50 text-gray-400 hover:text-white px-4 py-2.5 rounded-xl transition-all">
              <Plus className="w-4 h-4" /> Add health report
            </button>
          ) : (
            <div className="bg-dark-900 border border-dark-600 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-white">Upload health report</span>
                <button onClick={() => { setShowUpload(false); setSelectedFile(null); }}
                  className="text-gray-500 hover:text-gray-300">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-4 ${
                  selectedFile ? "border-blue-500/50 bg-blue-500/5" : "border-dark-500 hover:border-dark-400"
                }`}>
                <Upload className="w-6 h-6 text-gray-500 mx-auto mb-2" />
                {selectedFile ? (
                  <div>
                    <div className="text-sm text-white font-medium">{selectedFile.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm text-gray-400">Click to select PDF or image</div>
                    <div className="text-xs text-gray-600 mt-1">Max 10MB — PDF, JPG, PNG</div>
                  </div>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
              </div>

              <input value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Description — e.g. Blood test results Jan 2026"
                className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 mb-4 transition-all" />

              <button onClick={handleUpload} disabled={uploading || !selectedFile}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2">
                {uploading ? <><Spinner size="sm" /> Uploading...</> : <><Upload className="w-4 h-4" /> Upload report</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Full-screen viewer using blob URL — works in all browsers */}
      {viewingReport && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex flex-col">
          <div className="flex items-center justify-between p-4 bg-dark-900 border-b border-dark-600 flex-shrink-0">
            <span className="text-sm font-medium text-white truncate">{viewingReport.original_name}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {viewBlob && (
                <button onClick={() => openInNewTab(viewingReport)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-dark-800 border border-dark-600 px-3 py-1.5 rounded-lg transition-all">
                  <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
                </button>
              )}
              <button onClick={closeViewer} className="text-gray-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
            {loadingView ? (
              <div className="flex flex-col items-center gap-3">
                <Spinner size="lg" />
                <div className="text-sm text-gray-400">Loading file...</div>
              </div>
            ) : viewBlob ? (
              viewingReport.file_type === "application/pdf" ? (
                <object
                  data={viewBlob}
                  type="application/pdf"
                  className="w-full h-full rounded-xl"
                  style={{ minHeight: "80vh" }}>
                  <div className="text-center text-gray-400 py-8">
                    <p className="mb-3">PDF cannot be displayed in browser.</p>
                    <button onClick={() => downloadReport(viewingReport)}
                      className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl mx-auto transition-all">
                      <Download className="w-4 h-4" /> Download PDF
                    </button>
                  </div>
                </object>
              ) : (
                <img src={viewBlob} alt={viewingReport.original_name}
                  className="max-w-full max-h-full object-contain rounded-xl" />
              )
            ) : (
              <div className="text-center text-gray-400">
                <p className="mb-3">Could not load file</p>
                <button onClick={() => downloadReport(viewingReport)}
                  className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-xl mx-auto">
                  <Download className="w-4 h-4" /> Download instead
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reports list */}
      {reports.length === 0 ? (
        <div className="text-center py-8 text-gray-600 text-sm">
          {canUpload ? "No reports yet — add your first health report above" : "No health reports available"}
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(report => (
            <div key={report.id}
              className="bg-dark-900 border border-dark-600 rounded-xl p-4 flex items-center justify-between gap-3 hover:border-dark-500 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-dark-700 rounded-xl flex items-center justify-center flex-shrink-0">
                  {report.file_type === "application/pdf"
                    ? <FileText className="w-4 h-4 text-red-400" />
                    : <Image className="w-4 h-4 text-blue-400" />
                  }
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{report.original_name}</div>
                  {report.description && <div className="text-xs text-gray-500">{report.description}</div>}
                  <div className="text-xs text-gray-600 mt-0.5">{timeAgo(report.uploaded_at)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openReport(report)}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-all">
                  <Eye className="w-3.5 h-3.5" /> View
                </button>
                <button onClick={() => downloadReport(report)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 bg-dark-800 hover:bg-dark-700 px-3 py-1.5 rounded-lg transition-all border border-dark-600">
                  <Download className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
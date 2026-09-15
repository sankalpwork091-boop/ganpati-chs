import {
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  type LucideIcon,
} from "lucide-react";

/** Picks an icon and tint for a stored file's MIME type. */
export function fileVisual(fileType: string): {
  Icon: LucideIcon;
  className: string;
  label: string;
} {
  if (fileType.startsWith("image/")) {
    return { Icon: FileImage, className: "text-emerald-600", label: "Image" };
  }
  if (fileType.startsWith("video/")) {
    return { Icon: FileVideo, className: "text-purple-600", label: "Video" };
  }
  if (fileType === "application/pdf") {
    return { Icon: FileText, className: "text-red-600", label: "PDF" };
  }
  if (fileType.includes("spreadsheet") || fileType.includes("excel")) {
    return { Icon: FileSpreadsheet, className: "text-green-700", label: "Spreadsheet" };
  }
  if (fileType.includes("presentation") || fileType.includes("powerpoint")) {
    return { Icon: Presentation, className: "text-orange-600", label: "Presentation" };
  }
  if (fileType.includes("word") || fileType.includes("document")) {
    return { Icon: FileText, className: "text-blue-600", label: "Document" };
  }
  return { Icon: FileText, className: "text-ink-500", label: "File" };
}

/** True for types the browser can display in a tab rather than download. */
export function isPreviewable(fileType: string): boolean {
  return (
    fileType === "application/pdf" ||
    fileType.startsWith("image/") ||
    fileType.startsWith("video/")
  );
}

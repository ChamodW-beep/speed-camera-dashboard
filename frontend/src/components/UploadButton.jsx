import { useRef } from "react";
import { Upload } from "lucide-react";
import { buttonClass } from "./ui.jsx";

export const VIDEO_ACCEPT = ".mp4,.mov,.avi,.mkv,.webm,.m4v,video/*";

/** A button that opens the file picker and hands the chosen file to `uploader.upload`. */
export default function UploadButton({ uploader, variant = "primary", label = "Upload video" }) {
  const inputRef = useRef(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files && event.target.files[0];
          event.target.value = "";
          if (file) uploader.upload(file);
        }}
      />
      <button
        type="button"
        disabled={uploader.busy}
        onClick={() => inputRef.current && inputRef.current.click()}
        className={buttonClass(variant)}
      >
        <Upload size={17} aria-hidden="true" />
        {uploader.busy ? "Uploading " + Math.round(uploader.progress * 100) + "%" : label}
      </button>
    </>
  );
}

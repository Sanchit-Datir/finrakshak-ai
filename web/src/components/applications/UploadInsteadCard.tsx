import { Upload } from 'lucide-react';
import { Button } from '../ui/Button.js';

/** The alternative to filling the form: upload documents and take the details from them. */
export function UploadInsteadCard({ onUpload }: { onUpload: () => void }): React.JSX.Element {
  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <h3 className="font-semibold">Have the documents instead?</h3>
        <p className="text-muted text-sm">
          Upload or scan them. The application is created from the document fields you confirm, so
          you do not need to fill this form.
        </p>
      </div>
      <Button icon={Upload} onClick={onUpload} className="h-12 shrink-0 px-5">
        Upload documents instead
      </Button>
    </div>
  );
}

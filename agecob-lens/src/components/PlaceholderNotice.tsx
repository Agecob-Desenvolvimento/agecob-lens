interface PlaceholderNoticeProps {
  type: "BusinessPending" | "DatasetPending" | "EndpointPending" | "OutOfScope";
  reason: string;
  owner: "Business decision" | "Data source required";
}

export default function PlaceholderNotice({ type, reason, owner }: PlaceholderNoticeProps) {
  return (
    <div className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      <span className="font-semibold">Tipo de Placeholder:</span> {type} |{" "}
      <span className="font-semibold">Responsável:</span> {owner}
      <div className="text-amber-100/90">{reason}</div>
    </div>
  );
}

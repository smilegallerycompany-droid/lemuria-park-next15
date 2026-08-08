type Props = {
  title?: string;
  description?: string;
};

export function EmptyState({
  title = "Нет данных",
  description = "За выбранный период записей не найдено.",
}: Props) {
  return (
    <div className="internal-empty" role="status">
      <p className="internal-empty-title">{title}</p>
      <p className="internal-empty-text">{description}</p>
    </div>
  );
}

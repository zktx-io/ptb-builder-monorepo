export interface PTBTemplateItem {
  id: string;
  label: string;
  defaultName: string;
  description: string;
  detail: string;
  file: () => string;
}

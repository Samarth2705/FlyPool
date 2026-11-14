// The standard surface for page content: white panel, hairline border.
//   <Card>...</Card>                    default padding
//   <Card padding="none">...</Card>     for lists that draw their own rows
//   <Card as="section" aria-labelledby="x">...</Card>
const paddings = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-5 sm:p-8',
};

export default function Card({ as: Tag = 'div', padding = 'md', className = '', children, ...props }) {
  return (
    <Tag
      className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900 ${paddings[padding]} ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}

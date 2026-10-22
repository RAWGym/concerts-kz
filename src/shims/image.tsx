import type { ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
};

/** Аналог next/image: `fill` растягивает картинку на родителя. */
export default function Image({ fill, priority, className = "", style, ...rest }: Props) {
  return (
    <img
      {...rest}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={fill ? `absolute inset-0 h-full w-full ${className}` : className}
      style={style}
    />
  );
}

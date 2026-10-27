import type { ImgHTMLAttributes, SyntheticEvent } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
};

const markLoaded = (img: HTMLImageElement | null) => {
  if (img?.complete && img.naturalWidth > 0) img.dataset.loaded = "";
};

/**
 * Аналог next/image: `fill` растягивает картинку на родителя.
 * Картинки ниже первого экрана грузятся лениво и мягко проявляются.
 */
export default function Image({ fill, priority, className = "", style, onLoad, ...rest }: Props) {
  return (
    <img
      {...rest}
      ref={priority ? undefined : markLoaded}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      data-fade={priority ? undefined : ""}
      onLoad={(e: SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.dataset.loaded = "";
        onLoad?.(e);
      }}
      className={fill ? `absolute inset-0 h-full w-full ${className}` : className}
      style={style}
    />
  );
}

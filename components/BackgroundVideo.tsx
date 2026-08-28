export default function BackgroundVideo({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  return (
    <video
      autoPlay
      muted
      loop
      playsInline
      src={src}
      className={className}
    />
  );
}

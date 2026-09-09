"use client";

import { useEffect, useRef } from "react";

export default function EmailSignupForm() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || container.childElementCount > 0) return;

    const script = document.createElement("script");
    script.async = true;
    script.src =
      "https://eocampaign1.com/form/b4165b9a-ac90-11f1-bb8a-891967e37d57.js";
    script.setAttribute(
      "data-form",
      "b4165b9a-ac90-11f1-bb8a-891967e37d57"
    );
    container.appendChild(script);
  }, []);

  return <div ref={containerRef} className="mx-auto flex justify-center" />;
}

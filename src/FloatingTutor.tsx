import { useCallback, useEffect, useRef } from 'react';

/* Floating AI Tutor mascot that drifts around the screen with mouse tracking */

export default function FloatingTutor() {
  const eyeLeftRef = useRef<HTMLDivElement>(null);
  const eyeRightRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    [eyeLeftRef.current, eyeRightRef.current].forEach((eye) => {
      if (!eye) return;
      const rect = eye.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxMove = 1.5;
      const mx = dist > 0 ? (dx / dist) * maxMove : 0;
      const my = dist > 0 ? (dy / dist) * maxMove : 0;
      const pupil = eye.querySelector('span') as HTMLElement | null;
      if (pupil) pupil.style.transform = `translate(${mx}px, ${my}px)`;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  return (
    <div className="ai-tutor-float" aria-hidden="true">
      <div className="ai-tutor-mascot">
        <div className="ai-tutor-eyes">
          <div className="ai-tutor-eye" ref={eyeLeftRef}>
            <span />
          </div>
          <div className="ai-tutor-eye" ref={eyeRightRef}>
            <span />
          </div>
        </div>
      </div>
      <span className="ai-tutor-label">AI Tutor</span>
    </div>
  );
}

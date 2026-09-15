import { forwardRef, useRef } from "react";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { cn } from "@/lib/utils";

const Circle = forwardRef<
  HTMLDivElement,
  { className?: string; children?: React.ReactNode }
>(({ className, children }, ref) => {
  return (
    <>
      <div
        ref={ref}
        className={cn(
          "z-10 flex size-12 items-center justify-center rounded-full border-2 bg-white p-3 shadow-[0_0_20px_-12px_rgba(0,0,0,0.8)]",
          className
        )}
      >
        {children}
      </div>
      <div></div>
    </>
  );
})
Circle.displayName = "Circle"

const Rectangle = forwardRef<
  HTMLDivElement,
  { className?: string; children?: React.ReactNode }
>(({ className, children }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "z-10 flex w-fit items-center justify-center rounded-full border-2 bg-white p-3 px-6 shadow-[0_0_20px_-12px_rgba(0,0,0,0.8)]",
        className
      )}
    >
      {children}
    </div>
  )
})
Rectangle.displayName = "Rectangle"

const Icons = {
  printify: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" height="16" viewBox="0 0 25 28" width="16"><path d="m15.4984.0712891h-15.4984v7.6527509h14.351c.6618 0 1.2412.49379 1.3021 1.15749.0309.32669-.0619.63554-.24.88055-.1565.21498-.3796.38112-.6449.46372l-14.7682 4.6581v13.0431h9.62453v-8.2751c1.76987-.5586 3.54247-1.1106 5.30487-1.6935 2.1711-.7182 4.4528-1.3115 6.2732-2.7731 1.8899-1.5189 2.9004-4.0536 2.9004-6.45867 0-4.78109-3.8518-8.6553409-8.6046-8.6553409z" fill="currentColor"/></svg>
  ),
  user: () => (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#000000"
      strokeWidth="2"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
}

// Animated "Printify accounts -> golistee -> you" beam scene used on the landing page.
export function PrintifyBeam({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const div1Ref = useRef<HTMLDivElement>(null)
  const div2Ref = useRef<HTMLDivElement>(null)
  const div3Ref = useRef<HTMLDivElement>(null)
  const div4Ref = useRef<HTMLDivElement>(null)
  const div5Ref = useRef<HTMLDivElement>(null)
  const div6Ref = useRef<HTMLDivElement>(null)
  const div7Ref = useRef<HTMLDivElement>(null)

  return (
    <div
      className={cn(
        "relative flex h-[500px] w-full items-center justify-center overflow-hidden p-10",
        className
      )}
      ref={containerRef}
    >
      <div className="flex size-full max-w-lg flex-row items-stretch justify-between gap-10">
        <div className="flex flex-col justify-center">
          <Circle ref={div7Ref}>
            <Icons.user />
          </Circle>
        </div>
        <div className="flex flex-col justify-center">
          <Rectangle ref={div6Ref}>
            <span className="text-accent text-xl leading-none font-logo">golistee</span>
          </Rectangle>
        </div>
        <div className="flex flex-col justify-center gap-2">
          <Circle className="bg-sky-900 text-white" ref={div1Ref}>
            <Icons.printify />
          </Circle>
          <Circle className="bg-sky-800 text-white" ref={div2Ref}>
            <Icons.printify />
          </Circle>
          <Circle className="bg-sky-700 text-white" ref={div3Ref}>
            <Icons.printify />
          </Circle>
          <Circle className="bg-sky-600 text-white" ref={div4Ref}>
            <Icons.printify />
          </Circle>
          <Circle className="bg-sky-500 text-white" ref={div5Ref}>
            <Icons.printify />
          </Circle>
        </div>
      </div>
      {/* AnimatedBeams */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div1Ref}
        toRef={div6Ref}
        duration={6}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div2Ref}
        toRef={div6Ref}
        duration={6}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div3Ref}
        toRef={div6Ref}
        duration={6}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div4Ref}
        toRef={div6Ref}
        duration={6}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div5Ref}
        toRef={div6Ref}
        duration={6}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div6Ref}
        toRef={div7Ref}
        duration={6}
      />
    </div>
  )
}

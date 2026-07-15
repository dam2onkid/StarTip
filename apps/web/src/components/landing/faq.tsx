"use client";

import { motion, type Variants } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { faqItems } from "@/content/landing";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * FAQ section. Styled like a command-line help panel to keep the terminal/cyber
 * motif consistent across the landing narrative.
 */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};



export function Faq() {
  const reduced = usePrefersReducedMotion();

  return (
    <section
      aria-label="Frequently asked questions"
      id="faq"
      className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 border-t border-foreground/10 px-6 py-28 sm:py-36"
    >
      <div className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span className="text-primary" aria-hidden>&gt;</span>
          <span className="ml-2">FAQ</span>
        </span>
        <h2 className="font-display text-display-section text-balance text-foreground">
          Questions? Answered.
        </h2>
      </div>

      <motion.div
        variants={reduced ? undefined : container}
        initial={reduced ? false : "hidden"}
        whileInView={reduced ? undefined : "show"}
        viewport={{ once: true, amount: 0.2 }}
        className="mt-14"
      >
        <Accordion type="single" collapsible className="flex flex-col gap-3">
          {faqItems.map((item) => (
            <AccordionItem
              key={item.question}
              value={item.question}
              className="rounded-2xl border border-primary/10 bg-card/40 px-6 backdrop-blur-sm transition-colors duration-300 hover:border-primary/20"
            >
              <AccordionTrigger className="py-5 text-left font-display text-lg font-medium tracking-tight text-foreground [&[data-state=open]>svg]:text-primary">
                <span className="flex flex-1 items-start gap-3">
                  <span className="font-mono text-sm text-primary/80">&gt;</span>
                  {item.question}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-base leading-relaxed text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </motion.div>
    </section>
  );
}

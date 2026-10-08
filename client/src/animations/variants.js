// Shared Framer Motion animations, so every page moves the same way.
// Usage: <motion.div variants={fadeInUp} initial="hidden" animate="visible">

export const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

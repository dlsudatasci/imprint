import styles from './typography.module.css';

export function H1({ children, className }) {
    return (
        <h1 className={`${styles.h1} ${className || ''}`}>{children}</h1>
    );
}

export function H2({ children, className }) {
    return (
        <h2 className={`${styles.h2} ${className || ''}`}>{children}</h2>
    );
}

export function H3({ children, className }) {
    return (
        <h3 className={`${styles.h3} ${className || ''}`}>{children}</h3>
    );
}

export function P({ children, className }) {
    return (
        <p className={`${styles.p} ${className || ''}`}>{children}</p>
    );
}

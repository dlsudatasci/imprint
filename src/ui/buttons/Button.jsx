import styles from './styles.module.css';

export default function Button({
    submit, children, className, onClick, variant = 'outline'
}) {
    const variantClass = variant === 'solid' ? styles.solid : styles.outline;

    return (
        <button
            type={submit ? 'submit' : 'button'}
            onClick={onClick}
            className={`${className || ''} ${styles.button} ${variantClass}`}
        >
            {children}
        </button>
    );
}

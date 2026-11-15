/**
 * Decorator applied to a class. Accepts the TC39 standard call `(value, context)` and the legacy
 * `experimentalDecorators` call `(constructor)`.
 */
export type ModelClassDecorator = {
  (value: abstract new (...args: never[]) => object, context: ClassDecoratorContext): void;
  (constructor: abstract new (...args: never[]) => object): void;
};

/**
 * Decorator applied to an attribute (class field). Accepts the TC39 standard call
 * `(undefined, context)` and the legacy `experimentalDecorators` call `(prototype, key)`.
 */
export type ModelPropertyDecorator = {
  (value: undefined, context: ClassFieldDecoratorContext): void;
  (prototype: object, key: string | symbol): void;
};

/**
 * Decorator applied to a static method (hooks). Accepts the TC39 standard call
 * `(method, context)` and the legacy `experimentalDecorators` call `(constructor, key, descriptor)`.
 */
export type ModelStaticMethodDecorator = {
  (value: (...args: never[]) => unknown, context: ClassMethodDecoratorContext): void;
  (constructor: object, key: string | symbol, descriptor?: PropertyDescriptor): void;
};

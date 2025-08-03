export interface FixiEvents {
  "fx:init": Event;
  "fx:inited": Event;
  "fx:process": Event;
  "fx:config": Event;
  "fx:before": Event;
  "fx:after": Event;
  "fx:error": Event;
  "fx:finally": Event;
  "fx:swapped": Event;
}

export interface FixiAttributes {
  "fx-action"?: string;
  "fx-method"?: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  "fx-trigger"?: keyof FixiEvents | ({} & string);
  "fx-target"?: "body" | "self" | "parent" | "closest" | ({} & string);
  "fx-ignore"?: true;
  "fx-swap"?:
    | "innerHTML"
    | "outerHTML"
    | "afterbegin"
    | "beforebegin"
    | "beforeend"
    | "afterend"
    | ({} & string);
}

export interface HTMLElement extends FixiAttributes {}

export interface GlobalEventMap {
  "fx:init": Event;
  "fx:inited": Event;
  "fx:process": Event;

  "fx:before": Event;
  "fx:after": Event;
  "fx:error": Event;
  "fx:finally": Event;
  "fx:swapped": Event;
}

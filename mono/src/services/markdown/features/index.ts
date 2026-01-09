import { TableFeature } from "./table";
import { OrderedListFeature } from "./orderedList";
import { TodoListFeature } from "./todoList";
import { UnorderedListFeature } from "./unorderedList";

// Features are ordered by pattern specificity (most restrictive first).
// TableFeature uses ^\| which only matches lines starting with |.
export const MARKDOWN_FEATURES = [
  TableFeature,
  TodoListFeature,
  OrderedListFeature,
  UnorderedListFeature,
];

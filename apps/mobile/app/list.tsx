import { Redirect } from 'expo-router';

/** /list is web's old My Lists address and still gets linked. Same redirect as web. */
export default function ListRoute() {
  return <Redirect href="/(app)/my-lists" />;
}

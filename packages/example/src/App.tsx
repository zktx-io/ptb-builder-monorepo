import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { Root } from './pages/root';
import { Viewer } from './pages/viewer';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
  },
  {
    path: '/viewer',
    element: <Viewer />,
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;

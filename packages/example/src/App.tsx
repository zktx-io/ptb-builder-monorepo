import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { Editor } from './pages/editor';
import { Home } from './pages/home';
import { Viewer } from './pages/viewer';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/editor',
    element: <Editor />,
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

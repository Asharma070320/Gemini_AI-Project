import React from 'react'
import {createBrowserRouter,RouterProvider} from 'react-router-dom'
import Home from '../pages/Home'
import Login from '../pages/Login'
import SignUp from '../pages/SignUp'
import ProtectedRoute from '../components/ProtectedRoute'
const Routing = () => {
    const routes = createBrowserRouter([
        {
            path: '/',
            element: (
                <ProtectedRoute>
                <Home />
                </ProtectedRoute>
            ),
            errorElement: <h2>404 error element</h2>
        },
        {
            path: '/login',
            element: <Login />
        },
        {
            path: '/sign-up',
            element: <SignUp />
        }
    ])
  return (
    <RouterProvider router={routes}></RouterProvider>
  )
}

export default Routing
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import React, { useState } from 'react'
import { database } from '../auth/firebase';

const Prac = () => {
    const[txt,setTxt] = useState("");
    const[id,setId] = useState(null);

    const btn = async() => {
        try{
           let chatId = id;
           if(!chatId){
            const chatDocRef = await addDoc(collection(database,'chat'),{
                timestamp: serverTimestamp()
            });
            chatId = chatDocRef.id;
            setId(chatId)
           }
           const msgCollectionRef = collection(database,'chat',chatId,'msg')
           await addDoc(msgCollectionRef,{
            sender: "user",
            text: txt,
            timestamp: serverTimestamp()
           })
           setTxt('')
       }catch(err){
        alert(err)
       }
    } 
    console.log(id);
  return (
    <div>
        <input className='border-2' onChange={(e) => setTxt(e.target.value)} type="text" name="text" id="text" />
        <button onClick={btn}>Add</button>
    </div>
  )
}

export default Prac
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const supabase = createClient(supabaseUrl, supabaseKey);

import { uploadOrDataUrl } from "../../../lib/storage-upload";
async function uploadBase64ToStorage(base64Str: string, path: string): Promise<{
  url: string; usedStorage: boolean;
}> {
  return uploadOrDataUrl(supabase, base64Str, path);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const {
      full_name,
      phone,
      company_name,
      id_proof_number,
      purpose_of_visit,
      meet_employee_id,
      photo_image,
      signature_image,
      latitude,
      longitude,
      location_address,
    } = payload;

    if (!full_name || !phone || !meet_employee_id || !purpose_of_visit || !photo_image || !signature_image) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const visitorId = crypto.randomUUID();
    let embedding: number[] | null = null;
    let finalPhotoB64 = photo_image;

    // 1. Call the Python backend to extract the face embedding and cropped face base64
    try {
      const extractRes = await fetch(`${backendUrl}/api/extract`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || ""}` 
        },
        body: JSON.stringify({ image: photo_image }),
      });

      if (!extractRes.ok) {
        const regData = await extractRes.json().catch(() => ({}));
        return NextResponse.json({
          error: regData.error || "No face detected in the visitor photo. Please take a clearer photo.",
        }, { status: 400 });
      }

      const extData = await extractRes.json();
      embedding = extData.embedding || null;
      if (extData.photo_url) {
        finalPhotoB64 = extData.photo_url;
      }
    } catch (regErr: any) {
      console.error("Error calling Python face extraction:", regErr);
      // Proceed anyway if backend is temporarily unreachable, to keep system resilient
    }

    // 2. Upload original photo and cropped face chip to Supabase Storage
    const originalPath = `visitors/${visitorId}_original.jpg`;
    const photoPath = `visitors/${visitorId}_photo.jpg`;
    
    const origUp = await uploadBase64ToStorage(photo_image, originalPath);
    const photoUp = await uploadBase64ToStorage(finalPhotoB64, photoPath);
    const photoPublicUrl = photoUp.url;

    // 3. Upload signature to Supabase Storage
    const signaturePath = `visitors/${visitorId}_sig.png`;
    const sigUp = await uploadBase64ToStorage(signature_image, signaturePath);
    const signaturePublicUrl = sigUp.url;

    // 4. Insert record into visitors table
    const { data, error } = await supabase
      .from("visitors")
      .insert({
        visitor_id: visitorId,
        full_name,
        phone,
        company_name,
        id_proof_number,
        purpose_of_visit,
        meet_employee_id,
        photo_image: photoPublicUrl,
        signature_image: signaturePublicUrl,
        embedding,
        latitude,
        longitude,
        location_address,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase visitors insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 4.1 Trigger WhatsApp Notification to the Employee
    if (meet_employee_id) {
      try {
        const { data: empData } = await supabase
          .from("known_faces")
          .select("name, mobile")
          .eq("id", meet_employee_id)
          .single();

        if (empData && empData.mobile) {
          const whatsappToken = process.env.whatapp_toke;
          // You can set WHATSAPP_API_URL in .env.local if this default one is incorrect
          const whatsappUrl = process.env.WHATSAPP_API_URL || "https://103.229.250.150/unified/v2/send";
          
          if (whatsappToken) {
             const visitorDate = new Date().toISOString().split('T')[0];
             const visitorCompany = company_name || "N/A";
             const logoUrl = "https://www.brihaspathi.com/img/logo.png"; // Brihaspathi logo for header

             // Format mobile number: WhatsApp APIs usually require country code.
             // If it's a 10 digit Indian number, we prepend "91". If it already has it, we just clean it.
             let formattedMobile = empData.mobile.replace(/\D/g, ''); // Remove non-digits
             if (formattedMobile.length === 10) {
               formattedMobile = '91' + formattedMobile;
             } else if (formattedMobile.startsWith('0')) {
               formattedMobile = '91' + formattedMobile.substring(1);
             }

             // Custom GoInfinito / Unified API Payload
             const waPayload = {
                 apiver: "1.0",
                 whatsapp: {
                     ver: "2.0",
                     dlr: {
                         url: "https://hrms.s6h.in/Webhook.ashx"
                     },
                     messages: [
                         {
                             coding: 1,
                             id: "msg_" + Date.now(),
                             msgtype: 3,
                             type: "image",
                             contenttype: "image/jpeg",
                             templateid: "1727467",
                             templateinfo: `1727467~${empData.name}~${full_name}~${purpose_of_visit}~${visitorCompany}~${visitorDate}`,
                              mediadata: {
                                  link: photoUp.usedStorage ? photoPublicUrl : logoUrl
                             },
                             property: {
                                 media: {
                                     filename: "image.jpeg"
                                 }
                             },
                             dest: [ formattedMobile ]
                         }
                     ]
                 }
             };

             fetch(whatsappUrl, {
               method: "POST",
               headers: {
                 "Content-Type": "application/json",
                 "Authorization": `Bearer ${whatsappToken.replace("Bearer ", "")}`
               },
               body: JSON.stringify(waPayload)
             }).then(async (res) => {
                if (!res.ok) {
                   const errText = await res.text();
                   console.error("WhatsApp API Error:", res.status, errText);
                } else {
                   console.log(`WhatsApp Alert sent successfully to ${empData.name} (${empData.mobile})`);
                }
             }).catch(e => console.error("WhatsApp Request Failed:", e));
          } else {
            console.warn("WhatsApp Token (whatapp_toke) not found in env, skipping notification.");
          }
        }
      } catch (err) {
         console.error("Error sending WhatsApp notification:", err);
      }
    }

    // 5. Trigger Python backend cache refresh so the visitor is immediately recognized
    try {
      await fetch(`${backendUrl}/api/refresh_cache`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || ""}` }
      });
    } catch (refreshErr) {
      console.error("Failed to trigger python backend cache refresh:", refreshErr);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully registered visitor ${full_name}`,
      data,
    });
  } catch (err: any) {
    console.error("Next.js visitors route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("visitors")
      .select("*")
      .order("check_in_time", { ascending: false });

    if (error) {
      console.error("Supabase fetch visitors error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error("Next.js fetch visitors error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { visitor_id } = await request.json();
    if (!visitor_id) {
      return NextResponse.json({ error: "Missing visitor_id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("visitors")
      .update({ check_out_time: new Date().toISOString() })
      .eq("visitor_id", visitor_id)
      .select()
      .single();

    if (error) {
      console.error("Supabase visitors update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Next.js visitors PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const data = await request.json();
    const { visitor_id, full_name, phone, company_name, purpose_of_visit, meet_employee_id } = data;
    
    if (!visitor_id) {
      return NextResponse.json({ error: "Missing visitor_id" }, { status: 400 });
    }

    const { data: updatedData, error } = await supabase
      .from("visitors")
      .update({
        full_name,
        phone,
        company_name,
        purpose_of_visit,
        meet_employee_id
      })
      .eq("visitor_id", visitor_id)
      .select()
      .single();

    if (error) {
      console.error("Supabase visitors update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updatedData });
  } catch (err: any) {
    console.error("Next.js visitors PUT error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const visitor_id = url.searchParams.get("visitor_id");

    if (!visitor_id) {
      return NextResponse.json({ error: "Missing visitor_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("visitors")
      .delete()
      .eq("visitor_id", visitor_id);

    if (error) {
      console.error("Supabase visitors delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Visitor deleted successfully" });
  } catch (err: any) {
    console.error("Next.js visitors DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

